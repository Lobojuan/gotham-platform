#!/bin/sh
# Nightly backup of the Gotham CRM database. Keeps 30 days.
set -e
DIR=/srv/gotham/backups
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M)
docker exec oracle-postgres-1 pg_dump -U nuru -d gotham | gzip > "$DIR/gotham-$STAMP.sql.gz"
find "$DIR" -name 'gotham-*.sql.gz' -mtime +30 -delete
echo "$(date -Is) backup ok $(ls -la $DIR/gotham-$STAMP.sql.gz | awk '{print $5}') bytes" >> "$DIR/backup.log"
