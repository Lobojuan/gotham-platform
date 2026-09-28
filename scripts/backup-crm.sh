#!/usr/bin/env bash
# Create and validate a private local backup of the CRM database and uploaded media.
# Requires DATABASE_URL, pg_dump/pg_restore, tar and a readable MEDIA_DIR.
#   DATABASE_URL=postgres://... MEDIA_DIR=/srv/gotham/media ./scripts/backup-crm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL to the CRM database}"
MEDIA_DIR="${MEDIA_DIR:-$ROOT/apps/crm/media}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/.backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

for cmd in pg_dump pg_restore tar sha256sum find; do
  command -v "$cmd" >/dev/null || { echo "Missing required command: $cmd" >&2; exit 1; }
done
[[ -d "$MEDIA_DIR" && -r "$MEDIA_DIR" ]] || { echo "MEDIA_DIR is missing or unreadable: $MEDIA_DIR" >&2; exit 1; }
[[ "$KEEP_DAYS" =~ ^[1-9][0-9]*$ ]] || { echo "KEEP_DAYS must be a positive integer" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
WORK="$(mktemp -d "$BACKUP_DIR/.gotham-backup.XXXXXX")"
ARCHIVE=""
cleanup() {
  [[ -z "$ARCHIVE" || ! -e "$ARCHIVE" ]] || rm -f "$ARCHIVE"
  [[ -z "$WORK" || ! -d "$WORK" ]] || rm -rf "$WORK"
}
trap cleanup EXIT
chmod 700 "$WORK"

pg_dump --format=custom --no-owner --no-acl --file="$WORK/database.dump" "$DATABASE_URL"
pg_restore --list "$WORK/database.dump" >/dev/null
tar -C "$MEDIA_DIR" -czf "$WORK/media.tar.gz" .
tar -tzf "$WORK/media.tar.gz" >/dev/null
cat > "$WORK/RESTORE.txt" <<'EOF'
Restore into the intended database only after taking a separate backup of its current state:
  pg_restore --clean --if-exists --no-owner --no-acl --dbname="$DATABASE_URL" database.dump
Restore the media archive into the configured media directory:
  tar -xzf media.tar.gz -C "$MEDIA_DIR"
Keep the database and media from the same backup together.
EOF
(cd "$WORK" && sha256sum database.dump media.tar.gz RESTORE.txt > CHECKSUMS.sha256)

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/gotham-backup-$STAMP.tar.gz.partial"
tar -C "$WORK" -czf "$ARCHIVE" database.dump media.tar.gz RESTORE.txt CHECKSUMS.sha256
tar -tzf "$ARCHIVE" >/dev/null
chmod 600 "$ARCHIVE"
FINAL="$BACKUP_DIR/gotham-backup-$STAMP.tar.gz"
mv "$ARCHIVE" "$FINAL"
ARCHIVE=""
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'gotham-backup-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
echo "Validated backup created: $FINAL"
echo "Copy it to encrypted off-site storage and rehearse restoring it before relying on it."
