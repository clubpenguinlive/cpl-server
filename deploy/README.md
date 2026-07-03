# CPL container stack

> **Status: historical / superseded for the cpl-server deploy path.**
> This file documents the original 2026-06-17 containerization bring-up: building all four images on
> dev-01 and pushing them to `ghcr.io/clubpenguinlive` for the host to pull. Day-to-day cpl-server
> deploys no longer work that way. The canonical server deploy is the repo-root `deploy.sh` (see
> [`../DEPLOY.md`](../DEPLOY.md)): it overlays the repo tree onto the prod host with `git archive`,
> builds the `cpl-server` image locally on the host, and recreates the three world containers
> (`cpl-login`, `cpl-blizzard`, `cpl-blizzard2`). No ghcr push is involved. The first-time DB
> cutover and the post-deploy smoke check below remain accurate as reference.

Orchestration for the dockerized Club Penguin Live stack. Authored 2026-06-17; built per the locked
decisions in the namespace-root `CONTAINERIZATION-DECISIONS.md`. Target host: `cpl-01` (10.0.0.43),
see `CONTAINERIZATION-PROVISIONING.md`.

## Images (four)
| Image | Built from | Contents |
|---|---|---|
| `cpl-assets-base` | `cpl-assets` + a piefruit checkout | nginx + the ~2 GB piefruit `media`/`fonts` (CPL overlay on top), baked at `/usr/share/nginx/html/assets`. Rarely rebuilt (decision 13). |
| `cpl-web` | `cpl-client/Dockerfile.web` | `FROM cpl-assets-base`; webpack-built client `dist` + `styles`/`lib` + `create`/`account`/`pages`/`minigames` + branding + this `nginx.conf`. |
| `cpl-php` | `cpl-client/Dockerfile.php` | php-fpm 8.3 + the `create`/`account` PHP at the same docroot path nginx uses; `db-config.php` rendered from env at startup. |
| `cpl-server` | `cpl-server/Dockerfile` | Node 24 game server. One image, four roles via env: `WORLD=Login` (:6111), `WORLD=Blizzard` (:6112), `WORLD=Iceberg` (:6113, runs as `cpl-blizzard2`), `MODE=migrate` (one-shot). |

## Config (decision 8)
A single gitignored `.env` (from `.env.example`) feeds every service. Each image's entrypoint renders
its config file from env at startup (`config.json` for node, `db-config.php` for php), so the four old
DB-credential copies collapse to one source and no app code changes. Empty `RESEND_API_KEY` leaves the
mailer in scaffold mode (codes logged, not sent), the safe default.

## Build + promote (on dev-01, the builder)

> This `PUSH=1` / `DEPLOY=1` interface describes the original all-four-images bring-up and no longer
> matches the repo-root `deploy.sh`, which builds only the `cpl-server` image on the prod host and
> takes no such env flags. See [`../DEPLOY.md`](../DEPLOY.md) for the current server deploy.

```
PIEFRUIT_DIR=/path/to/piefruit-assets PUSH=1 ./deploy.sh        # build all four, push to ghcr
TAG=<tag> DEPLOY=1 ./deploy.sh                                   # recreate app images on cpl-01
```
The builder needs Docker + `docker login ghcr.io` (gh ephemeral token). Prod holds no durable ghcr
credential: the builder SSHes in and the host pulls during the run (decision 3).

## First-time bring-up + DB cutover (the one windowed step)
1. `scp` the stack to the host: put `docker-compose.yml`, `nginx.conf` (baked, ignore on host), and a
   filled `.env` in `/opt/cpl`. The `mariadb-data` volume already exists (provisioning).
2. Bring up the DB only on the empty volume so the init creates the `yukon` user + empty schema:
   `docker compose up -d mariadb`.
3. Cutover (brief downtime): dump prod and restore into the volume:
   `ssh cpl-prod "mysqldump --single-transaction --quick --routines --triggers clubpenguinlive" | docker compose exec -T mariadb mysql clubpenguinlive`
4. Bring up the rest: `docker compose up -d`. Validate behind `play-ctest.clubpenguinlive.net` first
   (test tunnel), then move the prod `TUNNEL_TOKEN` over and stop cloudflared on the old VM.
5. Keep the old prod VM parked as rollback; reclaim it after a stable window; turn `swgr-linux-runner`
   back on.

## Done-criteria for closing issues (standing rules)

### 1. Functional-not-symbolic

A feature is closeable only when it runs end to end: renders on screen, plays, pays out as applicable. Code presence is not sufficient. Two proof cases from this project:

- **Clubs** (server#10/client#7): shipped and closed while crashing every login. A Sequelize association alias mismatch (`as: 'club'` vs `as: 'Club'`) passed all code review but broke `GameUser.load` on every connection. The feature was "present" in every file and still took down all logins.
- **Cooking/Pizzatron** (server#8): MiniGame.js has game 910 defined, but the handler comment reads "wiring reserved; game not yet live." No SWF in the assets repo, no `triggerGame(910)` call anywhere in the client. Closed as "code present," reopened when verified the game is completely unlaunchable.

**Check:** before closing any feature issue, verify the critical path executes: the user can reach the feature, interact with it, and receive the expected outcome. For game economy features, verify a payout event fires server-side.

### 2. Cross-repo asset check

For any feature that introduces a new room, minigame, or UI screen: before closing, verify that the assets repo contains the referenced files. Specifically:

- The `*-pack.json` Phaser asset pack that the client scene loads on startup
- The room media directory (`cpl-assets/media/rooms/<room>/`) with actual sprite files
- Any SWF or minigame file referenced by `triggerGame()` or a Ruffle mount

**Check:** grep the client scene for `loadPack` or `assets/media/rooms/` and confirm each path exists in `cpl-assets/` or the piefruit base layer in prod. Cooking/Pizzatron failed this check: game 910 is in MiniGame.js but the SWF is absent from the assets repo and there is no client trigger.

---

## Post-deploy smoke check (mandatory after any server deploy)

After every `bash deploy.sh` that touches the server image (GameUser.load path, Clubs, auth, DB schema):

```bash
# Requires SSH tunnel to be up:
ssh -L 18081:172.18.0.5:80 -N -f cpl-prod
# Then from dev-01:
node .local-scratch/smoke_login.js
```

Expected output ends with: `PASS  Login recovery confirmed. getUserClub path is working.`

If it fails, roll back before the next deploy. The tunnel port (18081) and nginx container IP
(172.18.0.5) may change after a `docker compose down/up`; re-check with:
`ssh cpl-prod "docker inspect cpl-cpl-web-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"`

This check is critical because a Sequelize association alias mismatch (e.g., `as: 'club'` vs `as: 'Club'`)
silently deploys then crashes every login with a SequelizeEagerLoadingError. Smoke test catches it.

## Open sourcing caveats (verify before the first build)
- **piefruit base:** `deploy.sh` needs a local piefruit checkout (`PIEFRUIT_DIR`, pinned `9e6a576d`).
  It is on prod at `/opt/yukon/piefruit-assets`; the builder needs its own copy (clone once, or rsync
  the `media`/`fonts` over). The 1.6 GB `.git` is dropped via `git archive` and must never enter the image.
- **minigames:** `Dockerfile.web` copies `minigames/`. Confirm that directory is present in the client
  repo (on prod it is `/opt/yukon/minigames`, a sibling of `client`); if it is not tracked there, stage
  it into the build context first.
- **builder Docker:** dev-01 needs Docker to build. If it does not have it, build on `cpl-01` itself for
  the initial bring-up (it is not yet serving prod), then revert to dev-01-as-builder for steady state.
