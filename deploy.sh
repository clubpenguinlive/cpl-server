#!/usr/bin/env bash
# Deploy the CPL server from dev-01 to prod. Run from this repo on dev-01.
# See DEPLOY.md. prod is a deploy target: it never commits or pushes.
# NOTE: this restarts the live game and disconnects connected players.
set -euo pipefail

BRANCH=master
PROD=nick@10.0.0.72

# Pre-flight: config/config.json (DB creds, crypto secret) is gitignored and NOT
# shipped by git push; the server imports it at startup and the build copies it
# into dist only if present. A missing or malformed config makes the server
# crash-loop after the (destructive) build+restart. Verify it exists and is valid
# JSON with a non-empty DB password BEFORE pushing, so a bad/absent config aborts
# the deploy here instead of taking the live game down.
echo ">> pre-flight: required runtime config present + valid on prod"
ssh "$PROD" bash -s <<'PREFLIGHT'
set -e
f="/opt/yukon/server/config/config.json"
[ -f "$f" ] || { echo "  MISSING: $f (copy config_example.json and fill in)"; exit 1; }
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert d.get('database',{}).get('password'), 'database.password is empty'" "$f" \
  || { echo "  invalid/incomplete: $f"; exit 1; }
echo "  config OK"
PREFLIGHT

echo ">> publishing to GitHub (source of truth)"
git push origin "$BRANCH"

echo ">> shipping to prod (rejected if prod has uncommitted hand-edits)"
git push prod "$BRANCH"

echo ">> building + restarting on prod (this bounces Login + Blizzard)"
ssh "$PROD" 'cd /opt/yukon/server && npm run build && npm run restart'

echo ">> deployed $(git rev-parse --short HEAD) to prod"
echo ">> verify: ssh $PROD 'pm2 list'"
