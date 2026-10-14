#!/usr/bin/env bash
# Run everything locally: Postgres in Docker, the CRM, and the site.
#   ./scripts/dev.sh          site + API + back office on :4100
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" && -d "$HOME/Applications/Docker.app" ]]; then
    echo "→ starting Docker Desktop"
    open "$HOME/Applications/Docker.app" >/dev/null 2>&1 || true
    for _ in {1..60}; do
      docker info >/dev/null 2>&1 && break
      sleep 2
    done
  fi
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop (or your Docker engine), then retry." >&2
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx 'gotham-dev-db'; then
  docker update --restart unless-stopped gotham-dev-db >/dev/null
  if ! docker ps --format '{{.Names}}' | grep -qx 'gotham-dev-db'; then
    echo "→ restarting Postgres"
    docker start gotham-dev-db >/dev/null
    sleep 5
  fi
else
  echo "→ starting Postgres"
  docker run -d --name gotham-dev-db --restart unless-stopped \
    -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=gotham -e POSTGRES_DB=gotham \
    -p 5433:5432 postgres:16 >/dev/null
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
