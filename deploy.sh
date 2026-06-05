#!/usr/bin/env bash
# Deploy the CPL server from dev-01 to prod. Run from this repo on dev-01.
# See DEPLOY.md. prod is a deploy target: it never commits or pushes.
# NOTE: this restarts the live game and disconnects connected players.
set -euo pipefail

BRANCH=master
PROD=nick@10.0.0.72

echo ">> publishing to GitHub (source of truth)"
git push origin "$BRANCH"

echo ">> shipping to prod (rejected if prod has uncommitted hand-edits)"
git push prod "$BRANCH"

echo ">> building + restarting on prod (this bounces Login + Blizzard)"
ssh "$PROD" 'cd /opt/yukon/server && npm run build && npm run restart'

echo ">> deployed $(git rev-parse --short HEAD) to prod"
echo ">> verify: ssh $PROD 'pm2 list'"
