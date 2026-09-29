#!/usr/bin/env bash
# Put a secret (API key) into the server's .env without it touching git, the chat or your shell history.
#   bash scripts/set-secret.sh OPENAI_API_KEY
# You paste the value at a hidden prompt; the app is restarted so it takes effect.
set -euo pipefail
NAME="${1:?usage: set-secret.sh NAME}"
[[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "bad name"; exit 1; }
HOST="${HOST:-nuru@84.12.73.59}"; REMOTE="${REMOTE:-/srv/gotham}"
read -rsp "Paste the value for $NAME (hidden), then press Enter: " VAL; echo
[ -n "$VAL" ] || { echo "nothing entered"; exit 1; }
# single quotes keep characters like $ in a password exactly as typed (docker compose would otherwise expand them)
if [[ "$VAL" == *"'"* ]]; then LINE="$NAME=$VAL"; else LINE="$NAME='$VAL'"; fi
printf '%s' "$LINE" | ssh "$HOST" "cd $REMOTE && cp .env .env.bak-\$(date +%Y%m%d%H%M%S) && umask 077 && v=\$(cat) && { grep -v '^$NAME=' .env || true; } > .env.new && printf '%s\n' \"\$v\" >> .env.new && mv .env.new .env && chmod 600 .env && docker compose -p gotham up -d >/dev/null 2>&1 && echo '$NAME saved, app restarted'"
unset LINE
unset VAL
