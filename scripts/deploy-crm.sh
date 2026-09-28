#!/usr/bin/env bash
# Ship the CRM to the server and rebuild the container.
#   HOST=nuru@84.12.73.59  REMOTE=/srv/gotham  ./scripts/deploy-crm.sh
# The server's .env is never touched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOST:-nuru@84.12.73.59}"
REMOTE="${REMOTE:-/srv/gotham}"
. "$ROOT/scripts/git-guard.sh"; git_guard "$ROOT"

echo "→ backing up the current release"
ssh "$HOST" "rm -rf ~/backups/gotham.prev && mkdir -p ~/backups && cp -a $REMOTE ~/backups/gotham.prev"

echo "→ uploading"
# local node_modules are never shipped: the image installs its own (Linux) packages
rsync -az --exclude node_modules --exclude .env --exclude .media "$ROOT/apps/crm/" "$HOST:$REMOTE/"

echo "→ rebuilding"
ssh "$HOST" "cd $REMOTE && docker compose -p gotham up -d --build && echo $DEPLOY_COMMIT > $REMOTE/DEPLOYED_COMMIT"

echo "→ health check"
sleep 8
curl -fsS "${HEALTH_URL:-https://gotham.84-12-73-59.sslip.io}/api/health" && echo "  OK"   # the server itself, not through the WordPress bridge
