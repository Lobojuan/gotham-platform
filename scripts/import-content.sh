#!/usr/bin/env bash
# Load a folder of event content into the live back office, once: photos and videos (logo and dates handled on the server),
# the event text, tasks and draft messages, all described in the folder's manifest.json (see runImport in apps/crm/server.js).
#   bash scripts/import-content.sh ~/Downloads/gotham-import
# Safe to repeat: events that already have a gallery, and tasks or drafts with the same name, are left alone. Nothing is sent.
set -euo pipefail
DIR="${1:?give the folder that holds manifest.json}"
HOST="${HOST:-nuru@84.12.73.59}"
[ -f "$DIR/manifest.json" ] || { echo "no manifest.json in $DIR" >&2; exit 2; }
echo "→ uploading $(du -sh "$DIR" | cut -f1)"
ssh "$HOST" 'rm -rf /tmp/gotham-import && mkdir -p /tmp/gotham-import'
rsync -az "$DIR/" "$HOST:/tmp/gotham-import/"
echo "→ importing (videos are converted now: a few minutes)"
ssh "$HOST" 'set -e; docker exec gotham-crm-1 rm -rf /data/import; docker cp /tmp/gotham-import gotham-crm-1:/data/import
  rc=0; docker exec gotham-crm-1 node server.js --import /data/import/manifest.json || rc=$?
  docker exec gotham-crm-1 rm -rf /data/import; rm -rf /tmp/gotham-import; exit $rc'
