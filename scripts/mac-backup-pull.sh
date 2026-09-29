#!/usr/bin/env bash
# Off-site copy: pull the server's nightly backups to this Mac, check them, and tell the CRM it happened.
# Run by the LaunchAgent that mac-backup-install.sh sets up (daily at 09:40 and at log-in), or by hand.
set -uo pipefail
HOST="${HOST:-nuru@84.12.73.59}"
DEST="${DEST:-$HOME/Documents/Gotham backups}"
KEEP_DAYS="${KEEP_DAYS:-90}"
mkdir -p "$DEST"; chmod 700 "$DEST"
LOG="$DEST/pull.log"
if ! rsync -a --ignore-existing -e "ssh -o BatchMode=yes -o ConnectTimeout=20" "$HOST:/srv/gotham/backups/gotham-*.tar" "$DEST/" 2>>"$LOG"; then
  echo "$(date -Iseconds) pull failed" >> "$LOG"; exit 1
fi
LATEST="$(ls -1t "$DEST"/gotham-*.tar 2>/dev/null | head -1)"
[ -n "$LATEST" ] || { echo "$(date -Iseconds) no backup files yet" >> "$LOG"; exit 1; }
# the copy must be complete and match its checksums
TMP="$(mktemp -d)"; tar -xf "$LATEST" -C "$TMP" CHECKSUMS.sha256 database.dump media.tar.gz 2>>"$LOG"
if ! (cd "$TMP" && shasum -a 256 -c CHECKSUMS.sha256 >/dev/null 2>>"$LOG"); then
  rm -rf "$TMP"; echo "$(date -Iseconds) checksum mismatch in $(basename "$LATEST")" >> "$LOG"; exit 1
fi
rm -rf "$TMP"
find "$DEST" -maxdepth 1 -name 'gotham-*.tar' -mtime +"$KEEP_DAYS" -delete
N=$(ls -1 "$DEST"/gotham-*.tar | wc -l | tr -d ' ')
J=$(printf '{"at":"%s","latest":"%s","files":%s,"where":"Mac: Documents/Gotham backups"}' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$LATEST")" "$N")
echo "insert into settings(key,value) values ('backup_offsite', :'j') on conflict (key) do update set value=excluded.value;" \
  | ssh -o BatchMode=yes -o ConnectTimeout=20 "$HOST" "docker exec -i oracle-postgres-1 psql -q -U nuru -d gotham -v j='$J'" >/dev/null 2>>"$LOG"
echo "$(date -Iseconds) ok $(basename "$LATEST") ($N copies on this Mac)" >> "$LOG"
