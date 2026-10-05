#!/bin/bash
# Website end-to-end test: builds the site, starts the server on a fresh test database with a mock AI provider,
# then runs tests/e2e/site_e2e.js on phones (iPhone SE, iPhone 15, Galaxy A, Pixel 7), iPad and desktop.
#   PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chromium TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/gotham_test bash tests/e2e/run.sh
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DB=${TEST_DATABASE_URL:-postgres://test@127.0.0.1:5439/gotham_test}
ADMIN_DB=${DB%/*}/postgres; NAME=${DB##*/}
[[ "$NAME" =~ ^[a-zA-Z0-9_]+_test$ ]] || { echo "test database names must end in _test" >&2; exit 2; }
PORT=${E2E_PORT:-4199}
psql "$ADMIN_DB" -q -c "drop database if exists $NAME" -c "create database $NAME" || exit 2
python3 "$ROOT/apps/site/build.py" >/dev/null || { echo "site build failed"; exit 1; }
pkill -f "[m]ock_ai.js" ; pkill -f "[n]ode server.js"; sleep .5
MOCK_PORT=4299 node "$ROOT/tests/e2e/mock_ai.js" >/tmp/e2e-mock.log 2>&1 & MOCK=$!
rm -rf /tmp/e2e-media; mkdir -p /tmp/e2e-media
( cd "$ROOT/apps/crm" && DATABASE_URL=$DB SESSION_SECRET=e2e PORT=$PORT ADMIN_EMAIL=admin ADMIN_PASSWORD=e2e-owner-pass ADMIN_NAME=Admin \
  MEDIA_DIR=/tmp/e2e-media PUBLIC_URL=http://127.0.0.1:$PORT SITE_URL=http://127.0.0.1:$PORT SITE_DIR=$ROOT/apps/site/dist \
  OPENAI_API_KEY=e2e-test-key OPENAI_BASE_URL=http://127.0.0.1:4299 OPENAI_MODEL=mock-model ASK_DAILY_CAP=500 \
  node server.js >/tmp/e2e-server.log 2>&1 ) & SRV=$!
for i in $(seq 60); do curl -s -o /dev/null -w '%{http_code}' 127.0.0.1:$PORT/api/health | grep -q 200 && break; sleep .4; done
BASE=http://127.0.0.1:$PORT node "$ROOT/tests/e2e/site_e2e.js"; rc=$?
if [ "$rc" -eq 0 ]; then BASE=http://127.0.0.1:$PORT node "$ROOT/tests/ui/ask_voice_ui.js"; rc=$?; fi
if [ "$rc" -eq 0 ]; then BASE=http://127.0.0.1:$PORT node "$ROOT/tests/ui/investor_portal_ui.js"; rc=$?; fi
if [ "$rc" -eq 0 ]; then BASE=http://127.0.0.1:$PORT node "$ROOT/tests/ui/presentation_ui.js"; rc=$?; fi
kill $MOCK 2>/dev/null; pkill -f "[n]ode server.js"
exit $rc
