#!/usr/bin/env bash
# Run everything locally: Postgres in Docker, the CRM, and the site.
#   ./scripts/dev.sh          site + API + back office on :4100
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
export SESSION_SECRET=dev-secret PORT=4100
export ADMIN_EMAIL=admin ADMIN_PASSWORD=devpassword123 ADMIN_NAME=Admin
export MEDIA_DIR="$ROOT/apps/crm/.media" PUBLIC_URL=http://127.0.0.1:4100 SITE_URL=http://127.0.0.1:4100
export SITE_DIR="$ROOT/apps/site/dist"
mkdir -p "$MEDIA_DIR"
"$ROOT/scripts/build-site.sh"

echo
echo "  Site + back office   http://127.0.0.1:4100"
echo "  Sign in as admin / devpassword123, then change the first password."
echo
node server.js
