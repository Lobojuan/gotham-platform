#!/usr/bin/env bash
# Build the public site and publish it to our own server, where the back
# office already runs. One machine, one domain, no third-party deploy limits.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOST:-nuru@84.12.73.59}"
REMOTE="${REMOTE_SITE:-/srv/gotham-site}"
PUBLIC="${PUBLIC_URL:-https://gotham.84-12-73-59.sslip.io}"

SITE_URL="$PUBLIC" "$ROOT/scripts/build-site.sh"

echo "-> publishing to $HOST:$REMOTE"
ssh "$HOST" "sudo mkdir -p $REMOTE && sudo chown -R \$(id -u):\$(id -g) $REMOTE"
rsync -a --delete "$ROOT/apps/site/dist/" "$HOST:$REMOTE/"

echo "-> checking"
sleep 2
curl -fsS -o /dev/null -w "  home %{http_code}\n" "$PUBLIC/"
curl -fsS -o /dev/null -w "  register %{http_code}\n" "$PUBLIC/register.html"
curl -fsS -o /dev/null -w "  admin %{http_code}\n" "$PUBLIC/admin"
echo "  done"
