#!/bin/bash
# API regression: each suite gets a fresh database.  Needs a local Postgres you can drop/create databases on.
#   TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/run_api.sh
set -u
DB=${TEST_DATABASE_URL:-postgres://test@127.0.0.1:5439/gotham_test}
ADMIN_DB=${DB%/*}/postgres; NAME=${DB##*/}
cd "$(dirname "$0")/../apps/crm"
pass=0; fail=0
for f in ../../tests/api/*.py; do
  pkill -f "[n]ode server.js"; sleep .8
  psql "$ADMIN_DB" -q -c "drop database if exists $NAME" -c "create database $NAME"
  if out=$(TEST_DATABASE_URL=$DB timeout 300 python3 "$f" 2>&1) && echo "$out" | grep -q PASSED; then
    pass=$((pass+1)); echo "PASS $(basename $f) ($(echo "$out" | grep -c '  ok\| OK') checks)"
  else fail=$((fail+1)); echo "FAIL $(basename $f)"; echo "$out" | tail -12; fi
done
echo "suites passed $pass, failed $fail"; [ $fail -eq 0 ]
