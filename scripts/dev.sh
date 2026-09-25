#!/usr/bin/env bash
# Run everything locally: Postgres in Docker, the CRM, and the site.
#   ./scripts/dev.sh          CRM on :4100, site on :8080
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! docker ps --format '{{.Names}}' | grep -q '^gotham-dev-db$'; then
  echo "→ starting Postgres"
  docker run -d --name gotham-dev-db -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=gotham \
    -e POSTGRES_DB=gotham -p 5433:5432 postgres:16 >/dev/null
  sleep 5
fi

cd "$ROOT/apps/crm"
[ -d node_modules ] || npm install
export DATABASE_URL="postgres://gotham:dev@127.0.0.1:5433/gotham"
export SESSION_SECRET=dev-secret ALLOW_ORIGINS='*' PORT=4100
export ADMIN_EMAIL=admin ADMIN_PASSWORD=devpassword123 ADMIN_NAME=Admin
export MEDIA_DIR="$ROOT/apps/crm/.media" PUBLIC_URL=http://127.0.0.1:4100 SITE_URL=http://127.0.0.1:8080
mkdir -p "$MEDIA_DIR"
node server.js &
CRM=$!
trap 'kill $CRM 2>/dev/null' EXIT

"$ROOT/scripts/build-site.sh"
cd "$ROOT/apps/site/dist"
echo
echo "  CRM   http://127.0.0.1:4100   (admin / devpassword123)"
echo "  Site  http://127.0.0.1:8080"
echo
python3 -m http.server 8080
