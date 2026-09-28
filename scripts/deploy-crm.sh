#!/usr/bin/env bash
# Ship the CRM to the server and rebuild the container.
#   HOST=nuru@84.12.73.59  REMOTE=/srv/gotham  ./scripts/deploy-crm.sh
# The server's .env is never touched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOST:-nuru@84.12.73.59}"
REMOTE="${REMOTE:-/srv/gotham}"

echo "→ backing up the current release"
ssh "$HOST" "rm -rf ~/backups/gotham.prev && mkdir -p ~/backups && cp -a $REMOTE ~/backups/gotham.prev"

echo "→ uploading"
ssh "$HOST" 'rm -rf /tmp/crmup && mkdir -p /tmp/crmup'
scp -r "$ROOT/apps/crm/"* "$HOST:/tmp/crmup/"

echo "→ installing and rebuilding"
ssh "$HOST" "rsync -a --exclude .env /tmp/crmup/ $REMOTE/ && cd $REMOTE && docker compose -p gotham up -d --build"

echo "→ health check"
sleep 8
curl -fsS "${HEALTH_URL:-https://gotham.84-12-73-59.sslip.io}/api/health" && echo "  OK"   # the server address; gothamconsult.com still serves WordPress
