#!/usr/bin/env bash
# Exécuté sur le VPS par la CI: aligne le clone sur le commit poussé et relance les conteneurs.
set -euo pipefail

APP_DIR="${NINJARENA_DIR:-$HOME/ninjarena}"
TARGET="${NINJARENA_SHA:-origin/main}"

cd "$APP_DIR"
git fetch --prune origin
git checkout --quiet main
git reset --hard --quiet "$TARGET"
echo "deploying $(git rev-parse --short HEAD)"

docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose -f docker-compose.prod.yml ps
