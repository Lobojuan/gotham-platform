#!/usr/bin/env bash
# One-time: make this Mac keep an off-site copy of the Gotham backups every day (09:40, and at log-in).
#   bash scripts/mac-backup-install.sh          install or update
#   bash scripts/mac-backup-install.sh remove   stop and remove it
set -euo pipefail
LABEL=com.gothamconsult.backup-pull
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN="$HOME/Library/Application Support/GothamBackup"
if [ "${1:-}" = remove ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; rm -f "$PLIST"; echo "Removed. Existing copies stay in ~/Documents/Gotham backups."; exit 0
fi
mkdir -p "$BIN" "$HOME/Library/LaunchAgents"
cp "$(cd "$(dirname "$0")" && pwd)/mac-backup-pull.sh" "$BIN/pull.sh"; chmod 700 "$BIN/pull.sh"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$BIN/pull.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>40</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$BIN/error.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed. First copy running now; see ~/Documents/Gotham backups/pull.log"
