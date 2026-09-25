#!/usr/bin/env bash
# Put the previous CRM release back. Use when a deploy goes wrong.
set -euo pipefail
HOST="${HOST:-nuru@84.12.73.59}"
REMOTE="${REMOTE:-/srv/gotham}"
ssh "$HOST" "test -d ~/backups/gotham.prev && rsync -a --exclude .env ~/backups/gotham.prev/ $REMOTE/ && cd $REMOTE && docker compose -p gotham up -d --build"
echo "rolled back"
