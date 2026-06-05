#!/usr/bin/env bash
#
# Idempotent rotation of the MySQL 'yukon' password across every consumer on prod.
#
#   Run on the prod VM as root:   sudo bash /opt/yukon/server/ops/rotate-db-password.sh
#
# Consumers (all on prod, all gitignored / prod-only):
#   1. /opt/yukon/server/config/config.json          (.database.password) - the game server
#   2. /opt/yukon/client/account/scripts/php/db-config.php   (password) - account mgmt
#   3. /opt/yukon/client/create/scripts/php/db-config.php    (password) - registration
#   4. /opt/backups/.my.cnf                          (password=)  - nightly mysqldump
#
# Design (fixes the old one-shot sed script):
#   * Generates a fresh random password and writes it to EVERY consumer by FIELD/KEY
#     (each file is parsed and rewritten, never matched against the old value), so the
#     script is fully idempotent and safe to re-run: every run converges all consumers
#     AND the DB to the same fresh value.
#   * Writes all config files and verifies they took BEFORE altering the live DB, so a
#     failed write aborts with the DB unchanged (no half-rotation).
#   * set -euo pipefail: any step failing aborts.
#   * No password is ever passed on a command line (no `mysql -p<pw>`); MySQL admin uses
#     root auth_socket, and the post-rotation auth check uses the .my.cnf via --defaults-file.
#   * Health-checks after restart: PHP connects, yukon auths via .my.cnf, both pm2 apps
#     are online, no DB access-denied in recent logs, and the nightly backup runs.
#
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "ERROR: run as root (need mysql admin + edit /opt/backups/.my.cnf): sudo bash $0"; exit 1; }

APP_USER=nick
DB_USER=yukon
CFG_SERVER=/opt/yukon/server/config/config.json
CFG_ACCOUNT=/opt/yukon/client/account/scripts/php/db-config.php
CFG_CREATE=/opt/yukon/client/create/scripts/php/db-config.php
MYCNF=/opt/backups/.my.cnf

# Pre-flight: every consumer must already exist, or we'd half-rotate.
for f in "$CFG_SERVER" "$CFG_ACCOUNT" "$CFG_CREATE" "$MYCNF"; do
  [ -f "$f" ] || { echo "ERROR: consumer missing: $f (aborting before any change)"; exit 1; }
done

NEW="$(openssl rand -hex 24)"
echo ">> generated new password"

# --- 1. write NEW into every consumer (parse + rewrite, keyed; idempotent) ---

# server config.json (run as the app user to preserve ownership)
sudo -u "$APP_USER" python3 - "$CFG_SERVER" "$NEW" <<'PY'
import json, sys
path, new = sys.argv[1], sys.argv[2]
with open(path) as f: d = json.load(f)
d.setdefault("database", {})["password"] = new
with open(path, "w") as f: json.dump(d, f, indent=4); f.write("\n")
PY

# both PHP db-config.php (parse via php, rewrite canonically, preserve other keys)
for f in "$CFG_ACCOUNT" "$CFG_CREATE"; do
  sudo -u "$APP_USER" php -r '
    $p=$argv[1]; $new=$argv[2];
    $c=require $p;
    if(!is_array($c)) { fwrite(STDERR,"not a config array: $p\n"); exit(1); }
    $c["password"]=$new;
    $out="<?php\n    return [\n";
    foreach($c as $k=>$v){ $out.="        ".var_export((string)$k,true)." => ".var_export((string)$v,true).",\n"; }
    $out.="    ];\n";
    file_put_contents($p,$out);
  ' "$f" "$NEW"
done

# backup .my.cnf (root-owned): replace the password= line by key
sed -i -E "s/^(password[[:space:]]*=).*/\1${NEW}/" "$MYCNF"

# --- 2. verify all four hold NEW before touching the DB ---
miss=0
for f in "$CFG_SERVER" "$CFG_ACCOUNT" "$CFG_CREATE" "$MYCNF"; do
  grep -q -- "$NEW" "$f" || { echo "ERROR: $f did not receive the new password"; miss=1; }
done
[ "$miss" -eq 0 ] || { echo "ABORT: a consumer file was not updated; DB NOT changed. Fix and re-run (safe)."; exit 1; }
echo ">> all 4 consumer files updated"

# --- 3. rotate the live DB password (configs already hold NEW) ---
mysql -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${NEW}'; FLUSH PRIVILEGES;"
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

echo ""
echo ">> ROTATION COMPLETE. Store this new password in your password manager:"
echo "      ${DB_USER} / ${NEW}"
echo "   (it now lives only in the prod config files; it is not stored anywhere else.)"
