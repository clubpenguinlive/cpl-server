# CPL container stack

Orchestration for the dockerized Club Penguin Live stack. Authored 2026-06-17; built per the locked
decisions in the namespace-root `CONTAINERIZATION-DECISIONS.md`. Target host: `cpl-01` (10.0.0.43),
see `CONTAINERIZATION-PROVISIONING.md`.

## Images (four)
| Image | Built from | Contents |
|---|---|---|
| `cpl-assets-base` | `assets-clubpenguinlive` + a piefruit checkout | nginx + the ~2 GB piefruit `media`/`fonts` (CPL overlay on top), baked at `/usr/share/nginx/html/assets`. Rarely rebuilt (decision 13). |
| `cpl-web` | `client-clubpenguinlive/Dockerfile.web` | `FROM cpl-assets-base`; webpack-built client `dist` + `styles`/`lib` + `create`/`account`/`pages`/`minigames` + branding + this `nginx.conf`. |
| `cpl-php` | `client-clubpenguinlive/Dockerfile.php` | php-fpm 8.3 + the `create`/`account` PHP at the same docroot path nginx uses; `db-config.php` rendered from env at startup. |
| `cpl-server` | `server-clubpenguinlive/Dockerfile` | Node 24 game server. One image, three roles via env: `WORLD=Login` (:6111), `WORLD=Blizzard` (:6112), `MODE=migrate` (one-shot). |

## Config (decision 8)
A single gitignored `.env` (from `.env.example`) feeds every service. Each image's entrypoint renders
its config file from env at startup (`config.json` for node, `db-config.php` for php), so the four old
DB-credential copies collapse to one source and no app code changes. Empty `RESEND_API_KEY` leaves the
mailer in scaffold mode (codes logged, not sent), the safe default.

## Build + promote (on dev-01, the builder)
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
