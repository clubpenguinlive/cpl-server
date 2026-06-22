#!/usr/bin/env bash
# Deploy the CPL server to the Docker stack on cpl-prod.
# Overlays server files via git archive, builds cpl-server on the prod host,
# then hot-swaps cpl-login and cpl-blizzard. No pm2 on prod; no git remote.
# NOTE: restarts both game worlds and disconnects connected players.
# NOTE: if this deploy includes schema changes, run migrations first:
#   ssh cpl-prod "docker compose -f ~/cpl/cpl-server/deploy/docker-compose.yml run --rm cpl-migrate"
set -euo pipefail

BRANCH=master
PROD="${CPL_PROD:-cpl-prod}"
REGISTRY="${REGISTRY:-ghcr.io/clubpenguinlive}"
COMPOSE_FILE="~/cpl/cpl-server/deploy/docker-compose.yml"

echo ">> publishing to GitHub"
git push origin "$BRANCH"

echo ">> overlaying server files onto $PROD"
git archive HEAD | ssh "$PROD" "tar -x -C ~/cpl/cpl-server/"

echo ">> building cpl-server on $PROD"
ssh "$PROD" "docker build \
  -t ${REGISTRY}/cpl-server:stable \
  ~/cpl/cpl-server/"

echo ">> swapping cpl-login + cpl-blizzard + cpl-blizzard2 (disconnects all players)"
ssh "$PROD" "docker compose -f $COMPOSE_FILE up -d --no-deps cpl-login cpl-blizzard cpl-blizzard2"

echo ">> deployed $(git rev-parse --short HEAD) to prod"
echo ">> verify: ssh $PROD 'docker compose -f $COMPOSE_FILE ps'"
