#!/usr/bin/env bash
# Serve gothamconsult.com straight from our server instead of through the WordPress bridge.
# Run it AFTER the DNS change (A records for @ and www → 84.12.73.59) has reached the public resolvers:
#   bash scripts/go-direct.sh          check DNS, then switch
#   bash scripts/go-direct.sh check    only check DNS
# What it does on the server (with backups of both .env files):
#   1. Caddy (the shared web server) also answers for gothamconsult.com and www.gothamconsult.com and fetches
#      their HTTPS certificates. Caddy restarts once: the other sites on the server blink for a few seconds.
#   2. The CRM sends www.gothamconsult.com to gothamconsult.com (301), one address for Google.
set -euo pipefail
HOST="${HOST:-nuru@84.12.73.59}"; IP=84.12.73.59; DOMAIN=gothamconsult.com
ORACLE=/srv/nururoute/repo/deploy/oracle; GOTHAM=/srv/gotham
for n in "$DOMAIN" "www.$DOMAIN"; do
  for r in 1.1.1.1 8.8.8.8; do
    got=$(dig +short "$n" @"$r" | tail -1)
    [ "$got" = "$IP" ] || [ "$got" = "$DOMAIN." -a "$n" = "www.$DOMAIN" ] || { echo "✗ $n → ${got:-nothing} at $r (want $IP). Wait for the DNS change, then run again."; exit 1; }
  done
  echo "✓ $n points to our server"
done
[ "${1:-}" = check ] && exit 0
STAMP=$(date +%Y%m%d%H%M%S)
ssh "$HOST" "set -e
  cd $ORACLE && cp .env .env.bak-$STAMP
  cur=\$(grep '^GOTHAM_HOST=' .env | cut -d= -f2- | tr -d \"'\\\"\")
  case \"\$cur\" in *$DOMAIN*) echo 'Caddy already answers for $DOMAIN';; *)
    grep -v '^GOTHAM_HOST=' .env > .env.new && echo \"GOTHAM_HOST=\$cur, $DOMAIN, www.$DOMAIN\" >> .env.new && mv .env.new .env && chmod 600 .env
    docker compose -p oracle up -d caddy >/dev/null 2>&1 && echo 'Caddy restarted for $DOMAIN';; esac
  cd $GOTHAM && cp .env .env.bak-$STAMP
  cur=\$(grep '^REDIRECT_HOSTS=' .env | cut -d= -f2-)
  case \"\$cur\" in *www.$DOMAIN*) :;; *)
    grep -v '^REDIRECT_HOSTS=' .env > .env.new && echo \"REDIRECT_HOSTS=\${cur:+\$cur,}www.$DOMAIN\" >> .env.new && mv .env.new .env && chmod 600 .env
    docker compose -p gotham up -d >/dev/null 2>&1 && echo 'CRM restarted with the www redirect';; esac"
echo "→ waiting for the HTTPS certificate (up to 2 minutes)"
for i in $(seq 24); do
  if curl -fsS -m 10 --resolve "$DOMAIN:443:$IP" "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "✓ https://$DOMAIN is served directly by our server"
    curl -sS -o /dev/null -m 10 -w "  www → %{http_code} %{redirect_url}\n" --resolve "www.$DOMAIN:443:$IP" "https://www.$DOMAIN/invest"
    echo "Next: redeploy the site once (bash scripts/deploy-site.sh) so css and images come from the same address."
    exit 0
  fi
  sleep 5
done
echo "✗ No certificate yet. Check: ssh $HOST 'docker logs --tail 50 oracle-caddy-1'"; exit 1
