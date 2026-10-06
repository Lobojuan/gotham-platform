#!/usr/bin/env bash
# Tell Bing (and through it ChatGPT search, Copilot, DuckDuckGo, Yahoo) and Yandex that the site changed: IndexNow.
# Google does not take IndexNow; it reads the sitemap via Search Console. Run after a site deploy; never fails the deploy.
set -u
SITE=${SITE_URL:-https://gothamconsult.com}
KEY=3dc79bbb91cb177c752c150526c5925a
URLS=$(curl -s -m 20 "$SITE/sitemap.xml" | grep -o '<loc>[^<]*' | sed 's/<loc>//' | head -1000)
[ -z "$URLS" ] && { echo "  indexnow: no sitemap"; exit 0; }
JSON=$(printf '%s\n' $URLS | python3 -c "import sys,json;u=[l.strip() for l in sys.stdin if l.strip()];print(json.dumps({'host':'${SITE#https://}','key':'$KEY','keyLocation':'$SITE/$KEY.txt','urlList':u}))")
code=$(curl -s -o /dev/null -w '%{http_code}' -m 30 -H 'content-type: application/json; charset=utf-8' -d "$JSON" https://api.indexnow.org/indexnow)
echo "  indexnow: $(printf '%s\n' $URLS | wc -l | tr -d ' ') URLs sent, answer $code"
exit 0
