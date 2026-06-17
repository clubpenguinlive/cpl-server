#!/usr/bin/env bash
# CPL container build + promote. Runs on the BUILDER (dev-01). Builds the four images from the three
# local repo checkouts, optionally pushes to ghcr, then optionally deploys to the dockerized host
# over SSH (recreating app images only; the DB volume is never touched). Mirrors the SWG promotion.
#
# Prereqs on the builder:
#   - docker (with buildx) and `docker login ghcr.io` (gh ephemeral token, packages:write)
#   - the three repos under $CPL_ROOT
#   - a piefruit assets checkout at $PIEFRUIT_DIR pinned at $PIEFRUIT_REF (for cpl-assets-base)
#
# Usage:
#   PUSH=1 DEPLOY=1 ./deploy.sh            # full build, push, deploy
#   ./deploy.sh                            # build only (prove it compiles)
set -euo pipefail

CPL_ROOT="${CPL_ROOT:-$HOME/Documents/clubpenguinlive}"
SERVER="$CPL_ROOT/server-clubpenguinlive"
CLIENT="$CPL_ROOT/client-clubpenguinlive"
ASSETS="$CPL_ROOT/assets-clubpenguinlive"
REGISTRY="${REGISTRY:-ghcr.io/clubpenguinlive}"
TAG="${TAG:-$(date +%Y%m%d)-$(git -C "$SERVER" rev-parse --short HEAD 2>/dev/null || echo manual)}"
PIEFRUIT_DIR="${PIEFRUIT_DIR:?set PIEFRUIT_DIR to a piefruit assets checkout (pinned $PIEFRUIT_REF)}"
PIEFRUIT_REF="${PIEFRUIT_REF:-9e6a576d}"
DEPLOY_HOST="${DEPLOY_HOST:-cpl-01}"

echo "==> [1/4] cpl-assets-base (piefruit @ $PIEFRUIT_REF + CPL overlay)"
STAGE="$(mktemp -d)"
# decision 13: export the servable payload with git archive, NEVER copy the 1.6 GB .git checkout.
git -C "$PIEFRUIT_DIR" archive "$PIEFRUIT_REF" media fonts | tar -x -C "$STAGE"
cp -r "$ASSETS/media" "$STAGE/" 2>/dev/null || true     # CPL overrides win over the piefruit base
cp -r "$ASSETS/fonts" "$STAGE/" 2>/dev/null || true
cp "$ASSETS/Dockerfile" "$STAGE/Dockerfile"
docker build -t "$REGISTRY/cpl-assets-base:$TAG" -t "$REGISTRY/cpl-assets-base:stable" "$STAGE"
rm -rf "$STAGE"

echo "==> staging cpl-web context (minigames + nginx.conf are not tracked in the client repo)"
mkdir -p "$CLIENT/deploy"
cp "$SERVER/deploy/nginx.conf" "$CLIENT/deploy/nginx.conf"     # nginx.conf stays canonical in server/deploy
: "${MINIGAMES_DIR:?set MINIGAMES_DIR (lives at /opt/yukon/minigames on prod)}"
rsync -a --delete "$MINIGAMES_DIR/" "$CLIENT/minigames/"

echo "==> [2/4] cpl-web (FROM cpl-assets-base)"
docker build -f "$CLIENT/Dockerfile.web" \
  --build-arg ASSETS_BASE="$REGISTRY/cpl-assets-base:$TAG" \
  -t "$REGISTRY/cpl-web:$TAG" -t "$REGISTRY/cpl-web:stable" "$CLIENT"

echo "==> [3/4] cpl-php"
docker build -f "$CLIENT/Dockerfile.php" -t "$REGISTRY/cpl-php:$TAG" -t "$REGISTRY/cpl-php:stable" "$CLIENT"

echo "==> [4/4] cpl-server"
docker build -f "$SERVER/Dockerfile" -t "$REGISTRY/cpl-server:$TAG" -t "$REGISTRY/cpl-server:stable" "$SERVER"

if [ "${PUSH:-0}" = "1" ]; then
  echo "==> pushing :$TAG and :stable"
  for img in cpl-assets-base cpl-web cpl-php cpl-server; do
    docker push "$REGISTRY/$img:$TAG"
    docker push "$REGISTRY/$img:stable"
  done
fi

if [ "${DEPLOY:-0}" = "1" ]; then
  echo "==> deploying tag $TAG to $DEPLOY_HOST (app images only; DB volume untouched)"
  ssh "$DEPLOY_HOST" "cd /opt/cpl && IMAGE_TAG='$TAG' docker compose pull && IMAGE_TAG='$TAG' docker compose up -d --remove-orphans"
fi

echo "done. tag = $TAG"
