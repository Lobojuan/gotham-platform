#!/bin/sh
# Nightly safety net for the Gotham CRM, run by cron on the server (17 2 * * * /srv/gotham/backup.sh).
#  1. dump the database (custom format) and the uploaded media, with checksums, into /srv/gotham/backups
#  2. prove the dump works: restore it into a throw-away database, count the key tables, drop it
#  3. record the result in the CRM (settings key backup_status); the app warns the team when a backup
#     fails or is older than 36 hours. Copies leave the server when the Mac job pulls them (scripts/mac-backup-pull.sh).
# Keeps 30 days on the server.
set -u
DIR=/srv/gotham/backups
PG=${PG_CONTAINER:-oracle-postgres-1}
DB=${PG_DB:-gotham}
U=${PG_USER:-nuru}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DIR"; chmod 700 "$DIR"
LOG="$DIR/backup.log"
status() {   # true|false, detail
  D=$(printf %s "$2" | tr -d '"\\' | tr '\n\r\t' '   ' | cut -c1-300)
  J=$(printf '{"ok":%s,"at":"%s","file":"%s","bytes":%s,"detail":"%s"}' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${OUT:-}" "${BYTES:-0}" "$D")
  docker exec -i "$PG" psql -q -U "$U" -d "$DB" -v ON_ERROR_STOP=1 -v j="$J" >/dev/null 2>&1 <<'SQL'
insert into settings(key,value) values ('backup_status', :'j') on conflict (key) do update set value=excluded.value;
SQL
  echo "$(date -Is) $1 $2" >> "$LOG"
}
fail() { status false "$1"; rm -rf "$WORK"; exit 1; }

WORK=$(mktemp -d "$DIR/.work.XXXXXX")
docker exec "$PG" pg_dump -U "$U" -Fc --no-owner --no-acl -d "$DB" > "$WORK/database.dump" 2>"$WORK/err" || fail "database dump failed: $(head -c 200 "$WORK/err")"
[ -s "$WORK/database.dump" ] || fail "database dump is empty"
docker run --rm -v ${MEDIA_VOLUME:-gotham_gotham_media}:/m:ro alpine tar -C /m -czf - . > "$WORK/media.tar.gz" 2>"$WORK/err" || fail "media archive failed: $(head -c 200 "$WORK/err")"

# restore test into a throw-away database
T=gotham_restore_test
docker exec "$PG" dropdb -U "$U" --if-exists "$T" >/dev/null 2>&1
docker exec "$PG" createdb -U "$U" "$T" || fail "restore test: could not create the test database"
docker exec -i "$PG" pg_restore -U "$U" -d "$T" --no-owner --no-acl < "$WORK/database.dump" 2>"$WORK/err" || { docker exec "$PG" dropdb -U "$U" --if-exists "$T"; fail "restore test failed: $(head -c 200 "$WORK/err")"; }
COUNTS=$(docker exec "$PG" psql -U "$U" -d "$T" -Atc "select (select count(*) from users)||' users, '||(select count(*) from contacts)||' contacts, '||(select count(*) from registrations)||' registrations, '||(select count(*) from invoices)||' invoices'" 2>/dev/null)
LIVE=$(docker exec "$PG" psql -U "$U" -d "$DB" -Atc "select (select count(*) from users)||' users, '||(select count(*) from contacts)||' contacts, '||(select count(*) from registrations)||' registrations, '||(select count(*) from invoices)||' invoices'" 2>/dev/null)
docker exec "$PG" dropdb -U "$U" --if-exists "$T" >/dev/null 2>&1
[ -n "$COUNTS" ] || fail "restore test: the restored database could not be read"
[ "$COUNTS" = "$LIVE" ] || echo "$(date -Is) note: counts moved during the backup (restored: $COUNTS; live now: $LIVE)" >> "$LOG"

(cd "$WORK" && sha256sum database.dump media.tar.gz > CHECKSUMS.sha256)
cat > "$WORK/RESTORE.txt" <<'EOF'
To restore (after taking a backup of the current state):
  docker exec -i oracle-postgres-1 pg_restore -U nuru -d gotham --clean --if-exists --no-owner --no-acl < database.dump
  docker run --rm -i -v gotham_gotham_media:/m alpine tar -C /m -xzf - < media.tar.gz
Check the files first: sha256sum -c CHECKSUMS.sha256
EOF
OUT="gotham-$STAMP.tar"
tar -C "$WORK" -cf "$DIR/$OUT" database.dump media.tar.gz CHECKSUMS.sha256 RESTORE.txt || fail "could not write the archive"
chmod 600 "$DIR/$OUT"; rm -rf "$WORK"
BYTES=$(stat -c %s "$DIR/$OUT")
find "$DIR" -maxdepth 1 \( -name 'gotham-*.tar' -o -name 'gotham-*.sql.gz' \) -mtime +30 -delete
status true "restore test passed: $COUNTS"
