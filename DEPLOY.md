# Self-hosting cpl-server

This repo builds and runs the Club Penguin Live **game server**: the three Node "world"
processes (Login, Blizzard, Iceberg) that handle authentication, the game socket protocol,
and the MySQL-backed game economy. It does not contain the web client (`cpl-client`) or the
PHP account/registration backend (a separate repo). You can run this repo standalone against
your own client/frontend, or alongside the other CPL repos for a full stack.

Everything below is generic: no real hostnames, IPs, or accounts. Fill in your own.

## Prerequisites

- Docker and Docker Compose (v2 syntax, `docker compose ...`).
- A place to run the stack: any Linux host, VM, or your own machine works. No specific cloud
  provider is assumed.
- Nothing else. MariaDB runs as a container in the stack; you do not need a separate database
  server.

## 1. Get the repo and configure secrets

```bash
git clone https://github.com/clubpenguinlive/cpl-server.git
cd cpl-server
cp deploy/.env.example .env
```

Edit `.env` and fill in every blank value. At minimum:

| Variable | What it is |
|---|---|
| `DB_ROOT_PASSWORD` | MariaDB root password (container-local, pick anything strong) |
| `DB_PASSWORD` | Password for the `yukon` DB user the server connects as |
| `CRYPTO_SECRET` | JWT/session signing key. Generate one with `openssl rand -hex 32`. Never reuse a value that has ever been committed or shared. |
| `CORS_ORIGIN` | The origin your client is served from, e.g. `https://play.example.com`. Must match exactly or the browser client cannot connect. |

Optional:

- `RESEND_API_KEY` — leave empty to run in "scaffold mode," where email verification codes are
  logged to the server console instead of actually sent. Set a real transactional-email API key
  (the entrypoint is wired for [Resend](https://resend.com)'s SMTP relay, but any SMTP-compatible
  provider works if you adjust `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`) to send real emails.
- `TUNNEL_TOKEN` — only needed if you use a Cloudflare Tunnel (see the `cloudflared` service
  below). Remove that service entirely if you don't.
- `TURNSTILE_SECRET` — only consumed by the `cpl-php` service, which is not part of this repo.
  Irrelevant if you're running cpl-server standalone.
- `BLIZZARD_MAX_USERS` / `BLIZZARD2_MAX_USERS` — per-world population caps, default 300.

`.env` is gitignored. Never commit it.

## 2. Build the server image

The root `Dockerfile` builds a single image that can run any of the three worlds, selected at
container start by the `WORLD` environment variable:

```bash
docker build -t cpl-server:local .
```

`deploy/docker-compose.yml` references this image via `${REGISTRY:-ghcr.io/clubpenguinlive}/cpl-server:${IMAGE_TAG:-stable}`.
For a local build, either tag your build to match that name, or point the compose file at your
own tag by setting `REGISTRY` and `IMAGE_TAG` in `.env`, e.g.:

```
REGISTRY=local
IMAGE_TAG=dev
```

then `docker build -t local/cpl-server:dev .`.

## 3. Bring up the stack

```bash
docker compose -f deploy/docker-compose.yml up -d mariadb
```

Wait for it to report healthy (`docker compose -f deploy/docker-compose.yml ps`), then import
the base schema. The compose file does not auto-import SQL on first start, so on a fresh volume
you load it yourself:

```bash
docker compose -f deploy/docker-compose.yml exec -T mariadb \
  mysql -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" < yukon.sql
```

(match `$DB_ROOT_PASSWORD` / `$DB_NAME` to whatever you set in `.env`). Then apply the additive
migrations and start everything else:

```bash
docker compose -f deploy/docker-compose.yml run --rm cpl-migrate
docker compose -f deploy/docker-compose.yml up -d
```

`cpl-migrate` is a one-shot runner (`utils/migrate.js`) that applies the ordered `.sql` files in
`migrations/` on top of the base schema; it's safe to re-run, each migration only applies once.
`docker compose up -d` then brings up the three world containers (`cpl-login`, `cpl-blizzard`,
`cpl-blizzard2`) plus whatever else is defined in the compose file.

Note that `deploy/docker-compose.yml` as checked into this repo also defines `cpl-web` and
`cpl-php` services. Those images are built from the separate `cpl-client` repo and are not
buildable from this repo alone. If you're running cpl-server standalone, either:

- comment out or delete the `cpl-web`, `cpl-php`, and `cloudflared` service blocks and run only
  `mariadb`, `cpl-migrate`, `cpl-login`, `cpl-blizzard`, and `cpl-blizzard2`, or
- also clone and build `cpl-client` (and a compatible PHP account backend) to run the full stack.

## 4. Exposing the worlds

None of the world containers publish host ports by default; the compose file expects a reverse
proxy (nginx, in the reference `cpl-web` setup) to reach them over the internal `cpl` Docker
network by container name and port:

| Container | Internal port | Purpose |
|---|---|---|
| `cpl-login` | 6111 | Authentication |
| `cpl-blizzard` | 6112 | World 1 (game socket + `/players`) |
| `cpl-blizzard2` | 6113 | World 2, named "Iceberg" in config (game socket + `/players`) |

If you don't want to run a proxy container, add a `ports:` mapping to each world service in
`deploy/docker-compose.yml`, e.g.:

```yaml
  cpl-login:
    ports:
      - "6111:6111"
```

and point your client's socket connections directly at `your-host:6111` etc. `deploy/nginx.conf`
in this repo is the reference proxy config (it maps `/world/login`, `/world/blizzard`, and
`/world/iceberg` to the three containers, plus WebSocket upgrade headers) if you want to see how
the reference stack routes traffic.

## 5. Reverse proxy, TLS, and domain setup

Not covered here. Terminating TLS, picking a domain, rate limiting at the edge, and choosing
between a plain reverse proxy or something like a Cloudflare Tunnel are entirely up to you as
the operator. `deploy/nginx.conf` is provided as a working reference for the routes the server
expects, not as a turnkey production config; review and adapt it (server_name, upstream
addresses, TLS block) before using it as-is.

## Local development (no Docker)

For iterating on server code without containers, see the root `README.md`: `npm install`, copy
`config/config_example.json` to `config/config.json`, run `npm run secret-gen`, point it at a
local MySQL database, then `npm run dev`.
