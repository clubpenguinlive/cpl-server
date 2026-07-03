# Deploy workflow (server)

**The repo is the source of truth. dev-01 is where you work. prod only runs what it is given.**

```
edit + commit + push  ->  overlay onto prod  ->  build image + recreate worlds  ->  verify
       (dev-01)              (git archive)              (on prod host)
```

The stack is containerized: the game server runs as Docker Compose services on the prod host, not
as bare-metal pm2 processes. `deploy.sh` in the repo root is the canonical deploy.

## Rules

- **All authoring happens on dev-01** (this clone). Edit, commit, and `git push origin master` here.
  dev-01 is the only machine that talks to GitHub.
- **prod is a deploy target, not a dev box.** It never commits and holds no GitHub credentials. It
  receives an overlay of the repo tree, builds the image locally, and runs the Compose stack.
- **Never edit files directly on prod.** Make the change here, commit, deploy. A redeploy overwrites
  the prod tree from `git archive`, so any hand-edit on prod is silently lost.
- **Runtime secrets stay on prod only.** There is no committed `config.json` in the container path.
  Each container renders its own `config.json` at startup from a single gitignored `.env` on the
  host (`deploy/entrypoint-server.sh`). The repo tracks `config/config_example.json` (placeholders)
  for local dev only.

## The prod host

- **`cpl-prod` is the single source for the prod address**, a Host alias in `~/.ssh/config` on
  dev-01 (`HostName 10.0.0.43`, `User nick`). `deploy.sh` and these docs reference the alias; if
  prod's IP or user ever changes, edit only the ssh config. On a fresh machine, recreate it:
  ```
  Host cpl-prod
      HostName 10.0.0.43
      User nick
      IdentityFile ~/.ssh/id_ed25519
  ```
- The overlaid repo tree lives at `~/cpl/cpl-server/` on the host. The Compose file is
  `~/cpl/cpl-server/deploy/docker-compose.yml`.

## Worlds (three)

One `cpl-server` image runs all three worlds; the Compose env picks the role per container:

| Container | WORLD | Port |
|---|---|---|
| `cpl-login` | `Login` | 6111 |
| `cpl-blizzard` | `Blizzard` | 6112 |
| `cpl-blizzard2` | `Iceberg` | 6113 |

The third world is named **Iceberg** in config and nginx but runs in the `cpl-blizzard2` container.
That asymmetry is intentional; do not rename either side.

## Deploy

From this repo on dev-01:

```bash
./deploy.sh
```

which is:

```bash
git push origin master                                          # publish to GitHub
git archive HEAD | ssh cpl-prod "tar -x -C ~/cpl/cpl-server/"    # overlay the tree onto prod
ssh cpl-prod "docker build -t ghcr.io/clubpenguinlive/cpl-server:stable ~/cpl/cpl-server/"
ssh cpl-prod "docker compose -f ~/cpl/cpl-server/deploy/docker-compose.yml \
  up -d --no-deps cpl-login cpl-blizzard cpl-blizzard2"
```

The image is built on the prod host from the overlaid tree and tagged locally; nothing is pushed to
a registry as part of the deploy. `up -d --no-deps` recreates only the three world containers and
leaves mariadb, cpl-php, cpl-web, and cloudflared untouched.

> **Heads up:** recreating the world containers bounces the live game and disconnects connected
> players. Deploy server changes at low-traffic times, or warn players first.

## Migrations (only when the schema changes)

Migrations are additive-only and run as a one-shot `cpl-migrate` container that exits before the
worlds start. If a deploy includes schema changes, apply them first:

```bash
ssh cpl-prod "docker compose -f ~/cpl/cpl-server/deploy/docker-compose.yml run --rm cpl-migrate"
```

Never `docker compose down -v`: the `mariadb-data` volume is external and sacred.

## Verify after deploy

```bash
ssh cpl-prod "docker compose -f ~/cpl/cpl-server/deploy/docker-compose.yml ps"   # three worlds Up
```

For any change to server-side logic a player sees, tell the lead to run cpl-verifier before the
deploy is called done.

## Rollback

Check the repo out to the last good commit and redeploy; the overlay plus rebuild replaces the prod
tree and image:

```bash
git checkout <previous-good-sha>
./deploy.sh
git checkout master
```
