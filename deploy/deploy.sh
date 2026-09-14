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

# Vérifie le routage via Traefik sans dépendre du DNS public ni du certificat.
curl --fail --silent --show-error --insecure --retry 5 --retry-delay 3 --retry-all-errors \
  --resolve mathisfremiot.fr:443:127.0.0.1 -o /dev/null https://mathisfremiot.fr/ninjarena/
echo "smoke test passed"
