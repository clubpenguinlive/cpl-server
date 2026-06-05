# Club Penguin Live — Infrastructure (how it is actually wired)

Derived from the live systems on 2026-06-05 (not from memory). Every claim has a
re-verify command in the last section, run those to catch drift rather than trusting this doc.
**No secrets in this file** — only where they live and who consumes them.

## 1. Topology in one picture

```
                          ┌─────────────────────────── Cloudflare ───────────────────────────┐
  player browser  ─────▶  │  clubpenguinlive.net (apex)  →  Workers static site (Astro)        │
                          │  play.clubpenguinlive.net    →  Tunnel (outbound) ─────────┐       │
                          └─────────────────────────────────────────────────────────── │ ──────┘
                                                                                        ▼
                                                                      prod VM  nick@10.0.0.72
                                                                      (test-02 Hyper-V guest)
                                                                        cloudflared → nginx:80
                                                                          ├─ /            → /opt/yukon/client/dist  (static game client)
                                                                          ├─ /world/login → localhost:6111  (pm2 "Login",   World.js)
                                                                          └─ /world/blizzard → localhost:6112 (pm2 "Blizzard", World.js)
                                                                        MariaDB 127.0.0.1:3306  (db clubpenguinlive, user yukon)
```

Two completely decoupled front doors:
- **Apex `clubpenguinlive.net`** = the marketing landing, a Cloudflare **Workers static site** (repo `clubpenguinlive.net`, see its own README/DEPLOY). Independent of the VM, stays up even if the home server is down.
- **`play.clubpenguinlive.net`** = the actual game, served from the **on-prem VM** via a Cloudflare **Tunnel** (outbound, so it survives IP changes — that's why the .76→.72 guest-IP move didn't affect the public site).

## 2. Hosts

| Host | Address | Role |
|---|---|---|
| dev-01 | 10.0.0.58 | Dev box. The ONLY machine that authors code + talks to GitHub. Repos under `C:\Users\Nick\Documents\clubpenguinlive\`. |
| prod VM | `nick@10.0.0.72` | Ubuntu 24.04, 4 vCPU, ~3 GB RAM. Hyper-V guest on test-02. Runs the live game. **Deploy target only** (see §6). sudo password is the standard prod one. |
| nick-zimablade | 10.0.0.66 | Off-host backup target (RAID1). Receives the DB backups via Syncthing. |

## 3. Services on the prod VM

| Service | How it runs | Listens | Purpose |
|---|---|---|---|
| **nginx** | system service | `:80` (+ `:8080`, `:8081` landing-test) | Serves `/opt/yukon/client/dist`; reverse-proxies the two game WebSocket servers. |
| **game server** | pm2 apps **Login** + **Blizzard**, both `node /opt/yukon/server/dist/World.js <Login\|Blizzard>` (run as `nick`) | `:6111` (Login), `:6112` (Blizzard) | The Yukon Socket.IO game servers. |
| **MariaDB** | system service (10.11) | `127.0.0.1:3306` | DB `clubpenguinlive`, app user `yukon`. localhost-only. |
| **cloudflared** | system service, `tunnel run --token …` | outbound; metrics `127.0.0.1:20241` | The Cloudflare Tunnel. Ingress (hostname→service) is configured in the **Cloudflare Zero Trust dashboard** (token-managed, NOT a local config.yml). The token lives in the systemd unit — treat as a secret. |
| **syncthing** | system service (as `nick`) | `:8384` GUI (localhost), `:22000` sync | Ships the DB backups to the Zima. |

Request flow: browser → Cloudflare edge → Tunnel → nginx:80 → static `dist/` for pages, or `proxy_pass` to `localhost:6111` (`/world/login`) / `localhost:6112` (`/world/blizzard`) for the game sockets.

## 4. `/opt/yukon` layout (on prod)

| Path | What |
|---|---|
| `client/` | git repo (`client-clubpenguinlive`, branch `main`). Source; nginx serves the built `client/dist`. |
| `server/` | git repo (`server-clubpenguinlive`, branch `master`). pm2 runs `server/dist/World.js`. |
| `piefruit-assets/` | game media (atlases/fonts/music), symlinked into `client/dist` by the rebuild. **Base** = upstream `gitgud.io/piefruit/assets` @ `9e6a576d` (~3.5G, not mirrored). CP Live's ~58MB of overrides (configs/strings/art/music) live in the **`assets-clubpenguinlive`** repo and are overlaid on top (see §6). |
| `community-forks/` | reference forks (cpj2, cpa, mammoth, html5-minigames) — source material, not served. |
| `minigames/` | html5 minigames, symlinked into `dist`. |
| `recover_rebuild.sh` | the client build+stage script (see §6). **prod-only, untracked, hardcodes the sudo pw — TODO: version-control + NOPASSWD sudoers.** |
| `backup-db.sh` | nightly DB dump (see §8). prod-only, untracked. |
| `apply_csp.sh` | CSP header helper. prod-only. |
| `_repo-backups/` | git bundles taken during the 2026-06-05 reconciliation. |

## 5. Configs & secrets (where they live, who reads them)

All runtime secrets are **gitignored / prod-only**. The repos track only `*.example`/`*_example` placeholders.

| Secret/config | File (prod) | Consumed by | In git? |
|---|---|---|---|
| DB creds + crypto secret | `/opt/yukon/server/config/config.json` | game server (`World.js` imports `../config/config.json`) | no (gitignored; `config_example.json` tracked) |
| DB creds (account flow) | `/opt/yukon/client/account/scripts/php/db-config.php` | `account.php` | no (gitignored; `db-config.example.php` tracked) |
| DB creds (registration) | `/opt/yukon/client/create/scripts/php/db-config.php` | `create.php` | no |
| DB creds (backup) | `/opt/backups/.my.cnf` | `backup-db.sh` mysqldump | no |
| Cloudflare Tunnel token | cloudflared systemd unit | cloudflared | no |
| sudo password | (operator-held; also hardcoded in `recover_rebuild.sh` — TODO remove) | — | no |

The MySQL `yukon` password is the one credential with **4 consumers** — rotate it only with
`server/ops/rotate-db-password.sh` (idempotent; updates all four + the DB; see that script).

## 6. Repo → deploy chain (the workflow)

**Author on dev-01. prod is a deploy target: it never commits, never pushes, holds no GitHub creds.**

```
edit + commit + git push origin   (dev-01 → GitHub, source of truth)
        │
        └─ git push prod   (dev-01 → prod over SSH; prod has receive.denyCurrentBranch=updateInstead,
                             which checks out the pushed commit and REJECTS the push if prod was hand-edited)
                │
                ├─ client:  ssh prod 'bash /opt/yukon/recover_rebuild.sh'   (npm build → dist, relink assets/branding; no restart)
                └─ server:  ssh prod 'cd /opt/yukon/server && npm run build && npm run restart'  (babel → dist, pm2 restart — bounces players)
```

Each repo has `deploy.sh` (run from dev-01) + `DEPLOY.md`. `deploy.sh` runs a pre-flight that refuses
to deploy unless the gitignored runtime config exists+valid on the target.

**Assets** are the third deployable: **`assets-clubpenguinlive`** holds only CP Live's overrides on the
piefruit base (game config/strings, custom room art, music, SWFs, fonts, branding). Its `deploy.sh`
tars `fonts/` + `media/` and overlays them onto prod's `/opt/yukon/piefruit-assets`, then rebuilds the
client (so the cache-busted crumbs/assets are re-served). Game prompt strings (the `<key>_prompt` yes/no
windows) live in `media/crumbs/en/crumbs.json` here. After a deploy, prod == a
known commit. **Builds currently run on prod** (TODO: move off-prod / build to a temp dir so a failed
build can't wipe `dist`).

## 7. Data & backups

- DB: MariaDB `clubpenguinlive`. `backup-db.sh` runs nightly at **03:30** (nick crontab) → `mysqldump`
  (creds from `/opt/backups/.my.cnf`) → gzip → `/opt/backups/clubpenguinlive-<ts>.sql.gz`, keeps newest 14.
- Off-host: **Syncthing** sends `/opt/backups` to the Zima (`10.0.0.66`) RAID1, send-only + versioned.
- VM-level / Veeam backups: **Nick handles these himself** — do not set up backup/replication tooling.

## 8. Ground-truth re-verify (run these; don't trust the prose)

```bash
ssh nick@10.0.0.72 'sudo -u nick pm2 list'                 # Login + Blizzard online
ssh nick@10.0.0.72 'sudo ss -ltnp'                         # :80 nginx, :6111/:6112 node, :3306 mariadb (localhost)
ssh nick@10.0.0.72 'sudo grep -rE "server_name|root|proxy_pass" /etc/nginx/sites-enabled/'
ssh nick@10.0.0.72 'sudo systemctl status cloudflared mariadb nginx syncthing --no-pager'
ssh nick@10.0.0.72 'sudo -u nick crontab -l'               # 03:30 backup-db.sh
for r in client server; do ssh nick@10.0.0.72 "cd /opt/yukon/$r && git rev-parse --short HEAD && git status --short"; done
curl -s -o /dev/null -w '%{http_code}\n' https://play.clubpenguinlive.net   # 200
node <repo>/.local-scratch/verify_game.js   # from dev-01: login + both worlds connect, RESULT: PASS
```

## 9. Known gaps / TODO (as of 2026-06-05)

- Build runs on prod (`recover_rebuild.sh`, `npm run build`); a failed build can wipe `dist` (`rimraf dist` first). Move builds off-prod or build-to-temp-then-swap.
- `recover_rebuild.sh` + `backup-db.sh` are prod-only/untracked; `recover_rebuild.sh` hardcodes the sudo pw. Version-control them and move the sudo step to a NOPASSWD sudoers rule.
- DB creds exist in 4 hand-synced copies; consider a single source the PHP + server both read.
- Game boot still ships ~7.8 MB before login (mail + igloo atlases preloaded eagerly); deferring them is a real engine refactor (persistent sleep/wake scenes), not yet done.
