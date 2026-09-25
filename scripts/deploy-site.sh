#!/usr/bin/env bash
# Build and publish the public site to Netlify.
# Needs the netlify CLI, logged in:  npm i -g netlify-cli && netlify login
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_ID="${NETLIFY_SITE_ID:-6e8463b3-5e1e-4a16-8974-f2d31964db88}"
"$ROOT/scripts/build-site.sh"
cd "$ROOT/apps/site/dist"
netlify deploy --prod --dir=. --site="$SITE_ID"
