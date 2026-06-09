# Deploy workflow (server)

**The repo is the source of truth. dev-01 is where you work. prod only runs what it is given.**

```
edit + commit + push   →   deploy to prod   →   build + restart   →   verify
       (dev-01)                (git push)            (on prod)
```

## Rules

- **All authoring happens on dev-01** (this clone). Edit, commit, and `git push origin master` here.
  dev-01 is the only machine that talks to GitHub.
- **prod is a deploy target, not a dev box.** It never commits, never pushes, holds no GitHub
  credentials, and runs `/opt/yukon/server` checked out to the last deployed commit.
- **prod must always match a known commit.** Deploys are `git push` from dev-01 with
  `receive.denyCurrentBranch=updateInstead` on prod: the working tree is checked out to the pushed
  commit and the push is **refused if prod has any uncommitted hand-edit**.
- **Never edit files directly on prod.** Make the change here, commit, deploy.
- **Runtime secrets stay on prod only.** `config/config.json` (DB password, crypto secret, etc.) is
  gitignored and exists only on prod. The repo tracks `config/config_example.json` (placeholders).
  Never commit the real `config/config.json`.

## One-time setup (already done)

- **`cpl-prod` is the single source for the prod address**, a Host alias in `~/.ssh/config` on
  dev-01 (`HostName 10.0.0.72`, `User nick`). The deploy script, git remote, and these docs all
  reference the alias; if prod's IP or user ever changes, edit only the ssh config. On a fresh
  machine, recreate it:
  ```
  Host cpl-prod
      HostName 10.0.0.72
      User nick
      IdentityFile ~/.ssh/id_ed25519
  ```
- dev-01 has a `prod` git remote: `cpl-prod:/opt/yukon/server`
- prod has `git config receive.denyCurrentBranch updateInstead`
- prod's GitHub (`cpl`) push URL is disabled

## First-time provisioning (new / rebuilt target)

`config/config.json` (DB creds, crypto secret) is **gitignored and never shipped by git push**.
On a fresh target, create it once from the example and fill it in:

```bash
ssh cpl-prod
cp /opt/yukon/server/config/config_example.json /opt/yukon/server/config/config.json
# then edit config.json: real DB password, crypto.secret, etc.
```

`deploy.sh` runs a **pre-flight** that refuses to deploy (before pushing anything) if
`config.json` is missing or not valid JSON with a non-empty DB password, so a bad/absent config
aborts the deploy instead of crash-looping the live server after the destructive build+restart.

## Deploy

From this repo on dev-01:

```bash
./deploy.sh
```

which is:

```bash
git push origin master      # publish to GitHub
git push prod   master      # ship to prod (rejected if prod is dirty)
ssh cpl-prod 'cd /opt/yukon/server && npm run build && npm run restart'
```

`npm run build` runs babel `src -> dist`; `npm run restart` is `pm2 restart ecosystem.config.js`
(the **Login** and **Blizzard** processes, both run `dist/World.js`).

> **Heads up:** restarting bounces the live game and disconnects connected players. Deploy server
> changes at low-traffic times, or warn players first.

## Verify after deploy

```bash
ssh cpl-prod 'pm2 list'          # Login + Blizzard online
node <repo>/.local-scratch/verify_game.js   # from dev-01: both worlds connect, RESULT: PASS
```

## Rollback

```bash
git push prod <previous-good-sha>:master --force-with-lease
ssh cpl-prod 'cd /opt/yukon/server && npm run build && npm run restart'
```
