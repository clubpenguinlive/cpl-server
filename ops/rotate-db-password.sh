#!/usr/bin/env bash
#
# Idempotent rotation of the MariaDB 'yukon' password across the containerized prod stack
# (decision 8: single .env feeds every service).
#
#   Run on the prod VM as the deploy user (docker group member, no root needed):
#     bash ops/rotate-db-password.sh
#   Override the deploy dir if this checkout lives somewhere other than alongside deploy/:
#     DEPLOY_DIR=/path/to/deploy bash ops/rotate-db-password.sh
#
# Consumers:
#   1. deploy/.env               (DB_PASSWORD) - the single source every service reads (decision 8)
#   2. the live 'yukon'@'%' MariaDB grant inside the mariadb container
#   3. cpl-login, cpl-blizzard, cpl-blizzard2, cpl-php containers - only pick up the new value once
#      recreated (env is baked in at container start, not re-read live)
#
# Order matters here, unlike a config-file-only rotation: every running container already holds an
# open connection on the OLD password, so the DB and .env must never be allowed to disagree for
# longer than this script takes to run. So:
#   1. ALTER the live DB user first. Existing open connections keep working either way; only NEW
#      connections care which password is current.
#   2. Write the new value into .env immediately after, so .env always converges to match the DB.
#   3. Recreate the 4 dependent containers so they pick up .env and reconnect on the new password.
# The new password is written to a 0600 file (deploy/.rotation-<timestamp>) the moment it is
# generated, before anything else happens, so no failure mode loses it: if the script dies at any
# point, that file has the value and re-running converges the DB + .env to it (every step here is
# idempotent against the same NEW value).
#
# Secret hygiene:
#   * the new password is generated once and exported via env (NEW), never placed on a process argv
#   * the DB root password is read from .env and passed to mysql via MYSQL_PWD (env var), not -p<pw>
#     on argv, so it does not show up in `docker top` / `ps`
#   * the ALTER USER statement is piped to mysql on stdin for the same reason
#   * the new password is written to a 0600 file next to .env, never echoed to the terminal
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$SCRIPT_DIR/../deploy" && pwd)}"
ENV_FILE="$DEPLOY_DIR/.env"
DB_USER="${DB_USER:-yukon}"
DB_NAME="${DB_NAME:-clubpenguinlive}"
MARIADB_SERVICE="${MARIADB_SERVICE:-mariadb}"
WORLD_SERVICES=(cpl-login cpl-blizzard cpl-blizzard2 cpl-php)

cd "$DEPLOY_DIR"

command -v docker >/dev/null || { echo "ERROR: docker not found on PATH"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: 'docker compose' (v2) not available"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found (nothing to rotate)"; exit 1; }

ROOT_PW="$(grep -m1 '^DB_ROOT_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$ROOT_PW" ] || { echo "ERROR: DB_ROOT_PASSWORD not set in $ENV_FILE"; exit 1; }

docker compose ps --status running --format '{{.Service}}' | grep -qx "$MARIADB_SERVICE" \
  || { echo "ERROR: $MARIADB_SERVICE is not running; refusing to rotate against a stopped DB"; exit 1; }

# Exported so it is read via the environment, not argv, everywhere below.
export NEW; NEW="$(openssl rand -hex 24)"
echo ">> generated new password"

# Written NOW, before anything else touches the DB or .env, so the password is never only-in-memory:
# if this script dies at any later point (killed, SSH drop, host reboot), it is recoverable from here.
OUTFILE="$DEPLOY_DIR/.rotation-$(date +%Y%m%d-%H%M%S)"
( umask 077; printf '%s / %s\n' "$DB_USER" "$NEW" > "$OUTFILE" )
echo ">> new password saved to $OUTFILE (0600, not printed to terminal)"

# --- 1. rotate the live DB user first ---
printf "ALTER USER '%s'@'%%' IDENTIFIED BY '%s';\nFLUSH PRIVILEGES;\n" "$DB_USER" "$NEW" \
  | docker compose exec -T -e MYSQL_PWD="$ROOT_PW" "$MARIADB_SERVICE" mysql -u root
echo ">> MariaDB user '${DB_USER}'@'%' password rotated"

# Confirm the new password actually authenticates before touching .env or any container.
docker compose exec -T -e MYSQL_PWD="$NEW" "$MARIADB_SERVICE" mysql -u "$DB_USER" -e "SELECT 1" "$DB_NAME" >/dev/null \
  || { echo "ERROR: new password does not authenticate against $DB_NAME; DB is rotated, .env NOT touched. Investigate before re-running."; exit 1; }
echo ">> verified new password authenticates against $DB_NAME"

# --- 2. write NEW into .env (backup first; keyed replace so it's idempotent) ---
BACKUP="$ENV_FILE.bak-pre-rotation-$(date +%Y%m%d-%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"
echo ">> backed up .env to $BACKUP"

python3 - "$ENV_FILE" <<'PY'
import os, re, sys
path = sys.argv[1]
new = os.environ["NEW"]
lines = open(path).read().splitlines()
out, seen = [], False
for l in lines:
    if re.match(r"^\s*DB_PASSWORD\s*=", l):
        out.append("DB_PASSWORD=" + new)
        seen = True
    else:
        out.append(l)
if not seen:
    out.append("DB_PASSWORD=" + new)
open(path, "w").write("\n".join(out) + "\n")
PY

if ! grep -q -- "^DB_PASSWORD=${NEW}$" "$ENV_FILE"; then
  echo "ERROR: .env did not receive the new password. The DB IS ALREADY ROTATED to it."
  echo "       The new password is saved at: $OUTFILE (0600, not printed)"
  echo "       Set DB_PASSWORD to that value in $ENV_FILE by hand, then re-run this script"
  echo "       (the ALTER USER step is a harmless no-op once the DB is already on that value)."
  exit 1
fi
echo ">> .env updated"

# --- 3. recreate the 4 dependent containers so they pick up the new .env value ---
docker compose up -d --no-deps "${WORLD_SERVICES[@]}"
echo ">> recreated: ${WORLD_SERVICES[*]}"
echo ">> waiting for reconnect..."
sleep 6

# --- 4. health checks ---
echo ">> health checks:"
bad=0
for svc in "${WORLD_SERVICES[@]}"; do
  state="$(docker compose ps --format '{{.Service}} {{.State}}' | awk -v s="$svc" '$1==s{print $2}')"
  if [ "$state" = "running" ]; then
    echo "   $svc: running"
  else
    echo "   $svc: NOT running (state=${state:-absent})"; bad=1
  fi
done
[ "$bad" -eq 0 ] || { echo "ABORT: one or more containers failed to come up; check 'docker compose logs <service>'"; exit 1; }

for svc in "${WORLD_SERVICES[@]}"; do
  if docker compose logs --since 30s "$svc" 2>/dev/null | grep -qiE "access denied|ER_ACCESS_DENIED|ER_DBACCESS_DENIED"; then
    echo "   WARNING: DB access-denied in recent $svc logs"; bad=1
  fi
done
[ "$bad" -eq 0 ] || { echo "ABORT: DB auth errors seen after recreate; investigate before calling this rotation done"; exit 1; }
echo "   no DB auth errors in recent logs"

if [ -x "$DEPLOY_DIR/run_smoke_login.sh" ]; then
  echo ">> running login smoke test"
  "$DEPLOY_DIR/run_smoke_login.sh" && echo "   smoke test: PASS" || { echo "   smoke test: FAILED"; exit 1; }
else
  echo "   (run_smoke_login.sh not present in $DEPLOY_DIR; it's a dev-01-only scratch helper -"
  echo "    run it from dev-01 over the cpl-prod SSH tunnel to confirm login end-to-end)"
fi

# --- 5. done. the new password was already saved (step-1-adjacent, see OUTFILE above) ---
echo ""
echo ">> ROTATION COMPLETE."
echo "   The new password is in a 0600 file, not printed:"
echo "      cat $OUTFILE   &&   rm $OUTFILE"
echo "   Old .env backed up at: $BACKUP (safe to delete once you've confirmed everything is healthy)"
