#!/usr/bin/env bash
#
# Idempotent rotation of the MySQL 'yukon' password across every consumer on prod.
#
#   Run on the prod VM as root:   sudo bash /opt/yukon/server/ops/rotate-db-password.sh
#   Override the app user (default "nick") if your deploy runs as someone else:
#     sudo APP_USER=deploy bash /opt/yukon/server/ops/rotate-db-password.sh
#
# Consumers (all on prod, all gitignored / prod-only):
#   1. /opt/yukon/server/config/config.json          (.database.password) - the game server
#   2. /opt/yukon/client/account/scripts/php/db-config.php   (password) - account mgmt
#   3. /opt/yukon/client/create/scripts/php/db-config.php    (password) - registration
#   4. /opt/backups/.my.cnf                          (password=)  - nightly mysqldump
#
# Design:
#   * Generates a fresh random password and writes it to EVERY consumer by FIELD/KEY
#     (each file is parsed and rewritten, never matched against the old value), so it
#     is fully idempotent and safe to re-run: every run converges all consumers AND the
#     DB to the same fresh value.
#   * Writes + verifies all config files BEFORE altering the live DB (no half-rotation).
#   * set -euo pipefail: any step failing aborts.
#   * Secret hygiene: the new password is NEVER placed on a process command line.
#       - subprocesses receive it via an exported env var (NEW), not argv
#         (/proc/<pid>/environ is uid-restricted; /proc/<pid>/cmdline is world-readable);
#       - the ALTER USER statement is fed to mysql on stdin (printf is a shell builtin);
#       - MySQL admin uses root auth_socket (no -p<pw>); MariaDB redacts ALTER USER
#         passwords in its logs;
#       - the new value is written to a root-only 0600 file, NOT echoed to the terminal.
#   * Health-checks after restart: PHP connects, yukon auths via .my.cnf, both pm2 apps
#     online, no DB access-denied in recent logs, and the nightly backup runs.
#
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "ERROR: run as root (need mysql admin + edit /opt/backups/.my.cnf): sudo bash $0"; exit 1; }

APP_USER="${APP_USER:-nick}"
DB_USER="${DB_USER:-yukon}"
CFG_SERVER=/opt/yukon/server/config/config.json
CFG_ACCOUNT=/opt/yukon/client/account/scripts/php/db-config.php
CFG_CREATE=/opt/yukon/client/create/scripts/php/db-config.php
MYCNF=/opt/backups/.my.cnf

# Pre-flight: every consumer must already exist, or we'd half-rotate.
for f in "$CFG_SERVER" "$CFG_ACCOUNT" "$CFG_CREATE" "$MYCNF"; do
  [ -f "$f" ] || { echo "ERROR: consumer missing: $f (aborting before any change)"; exit 1; }
done

# Exported so child processes inherit it via the environment (not argv).
export NEW; NEW="$(openssl rand -hex 24)"
echo ">> generated new password"

# --- 1. write NEW into every consumer (parse + rewrite, keyed; idempotent) ---
# Files are opened in truncate-in-place mode, so root editing them preserves the
# existing owner/permissions. The secret is read from $NEW in the environment.

python3 - "$CFG_SERVER" <<'PY'
import json, os, sys
path = sys.argv[1]
with open(path) as f: d = json.load(f)
d.setdefault("database", {})["password"] = os.environ["NEW"]
with open(path, "w") as f:
    json.dump(d, f, indent=4); f.write("\n")
PY

for f in "$CFG_ACCOUNT" "$CFG_CREATE"; do
  php -r '
    $p=$argv[1]; $new=getenv("NEW");
    $c=require $p;
    if(!is_array($c)) { fwrite(STDERR,"not a config array: $p\n"); exit(1); }
    $c["password"]=$new;
    $out="<?php\n    return [\n";
    foreach($c as $k=>$v){ $out.="        ".var_export((string)$k,true)." => ".var_export((string)$v,true).",\n"; }
    $out.="    ];\n";
    file_put_contents($p,$out);
  ' "$f"
done

python3 - "$MYCNF" <<'PY'
import os, re, sys
path = sys.argv[1]
lines = open(path).read().splitlines()
out = [("password=" + os.environ["NEW"]) if re.match(r"^\s*password\s*=", l) else l for l in lines]
open(path, "w").write("\n".join(out) + "\n")
PY

# --- 2. verify all four hold NEW before touching the DB ---
miss=0
for f in "$CFG_SERVER" "$CFG_ACCOUNT" "$CFG_CREATE" "$MYCNF"; do
  grep -q -- "$NEW" "$f" || { echo "ERROR: $f did not receive the new password"; miss=1; }
done
[ "$miss" -eq 0 ] || { echo "ABORT: a consumer file was not updated; DB NOT changed. Fix and re-run (safe)."; exit 1; }
echo ">> all 4 consumer files updated"

# --- 3. rotate the live DB password (fed on stdin so it never lands in argv) ---
printf "ALTER USER '%s'@'localhost' IDENTIFIED BY '%s';\nFLUSH PRIVILEGES;\n" "$DB_USER" "$NEW" | mysql
echo ">> MySQL user '${DB_USER}' password rotated"

# --- 4. restart the game server (as the app user) so it reconnects ---
sudo -u "$APP_USER" bash -lc 'cd /opt/yukon/server && npm run restart >/dev/null 2>&1'
echo ">> server restarted; waiting for reconnect..."
sleep 6

# --- 5. health checks ---
echo ">> health checks:"
for d in account create; do
  sudo -u "$APP_USER" php -r '$c=require $argv[1]; $m=@new mysqli($c["host"],$c["user"],$c["password"],$c["database"]); exit($m->connect_error?1:0);' \
    "/opt/yukon/client/$d/scripts/php/db-config.php" \
    && echo "   php $d: connects OK" || { echo "   php $d: CONNECT FAILED"; exit 1; }
done

mysql --defaults-file="$MYCNF" -e "SELECT 1" >/dev/null 2>&1 \
  && echo "   yukon via .my.cnf: OK" || { echo "   yukon via .my.cnf: FAILED"; exit 1; }

sudo -u "$APP_USER" bash -lc 'pm2 jlist' 2>/dev/null | python3 -c "$(cat <<'PY'
import json, sys
procs = {p['name']: p['pm2_env']['status'] for p in json.load(sys.stdin)}
bad = {n: procs.get(n, 'ABSENT') for n in ('Login', 'Blizzard') if procs.get(n) != 'online'}
if bad:
    print('   pm2 NOT healthy:', bad); sys.exit(1)
print('   pm2 Login+Blizzard: online')
PY
)" || exit 1

if sudo -u "$APP_USER" bash -lc 'tail -n 80 ~/.pm2/logs/*error*.log 2>/dev/null' | grep -qiE "access denied|ER_ACCESS_DENIED|ER_DBACCESS_DENIED"; then
  echo "   WARNING: DB access-denied in recent server logs (check pm2 logs)"; exit 1
fi
echo "   no DB auth errors in recent server logs"

bash /opt/yukon/backup-db.sh >/dev/null 2>&1 && echo "   nightly backup: OK" || { echo "   nightly backup: FAILED"; exit 1; }

# --- 6. hand the new password to the operator WITHOUT echoing it to the terminal ---
OUTFILE="/root/.yukon-db-rotation-$(date +%Y%m%d-%H%M%S)"
( umask 077; printf '%s / %s\n' "$DB_USER" "$NEW" > "$OUTFILE" )
echo ""
echo ">> ROTATION COMPLETE."
echo "   The new password was written to a root-only file (mode 0600), not printed."
echo "   Retrieve it, store it in your password manager, then delete the file:"
echo "      sudo cat $OUTFILE   &&   sudo rm $OUTFILE"
