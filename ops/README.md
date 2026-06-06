# Prod ops scripts

The operational scripts that run on the prod VM (`/opt/yukon/...`), version-controlled here so they
are reviewable and restorable. They were previously untracked on the box, and two of them hardcoded
the sudo password; that secret has been removed (see below).

| Repo copy | Deployed to | Purpose | Sudo |
|---|---|---|---|
| `ops/recover_rebuild.sh` | `/opt/yukon/recover_rebuild.sh` | Load-bearing client rebuild (relays static assets `npm run build` wipes). Run on every client deploy. | best-effort `sudo -n` for one-time swap setup only (dormant; swap already present) |
| `ops/apply_csp.sh` | `/opt/yukon/apply_csp.sh` | Rewrite the nginx CSP + security headers for the game vhost. Run by hand for CSP changes. | interactive `sudo` (prompts) |
| `ops/backup-db.sh` | `/opt/yukon/backup-db.sh` | Nightly DB dump + 14-day retention (cron 03:30). | none (uses `/opt/backups/.my.cnf`) |
| `ops/rotate-db-password.sh` | run from repo | Rotate the MySQL `yukon` password across all consumers. | n/a |

## Secret removal

`recover_rebuild.sh` and `apply_csp.sh` previously contained `PW='private-penguin-2026'` piped into
`sudo -S`. Removed:
- `recover_rebuild.sh`: the swap block now uses non-interactive `sudo -n` and no-ops if it can't
  (swap is already configured on the box, so it never needs sudo on a normal rebuild).
- `apply_csp.sh`: now uses plain `sudo`, so an operator is prompted. It is a manual, rarely-run
  script, so interactive sudo is fine. For unattended use, add a NOPASSWD sudoers rule for the
  specific nginx commands instead of reintroducing a hardcoded password.

## Deploying a change

These live outside the server repo's runtime tree, so update the box copy explicitly after editing
here, e.g.:

```
scp ops/recover_rebuild.sh nick@<prod>:/opt/yukon/recover_rebuild.sh
```

`recover_rebuild.sh` is load-bearing: after changing it, run it once and confirm the verify lines
(`CP-BLUE CHROME PRESENT`, `MOBILE ROTATE OVERLAY PRESENT`) before trusting it.
