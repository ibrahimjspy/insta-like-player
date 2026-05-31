#!/bin/bash
# Installs (or reinstalls) the launchd agent that keeps Insta Like Player
# running on port 7319 and auto-starts it on login. Paths are derived from
# this script's location, so it works on any Mac / any user.
#
# Usage:  bash scripts/install-service.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.instalikeplayer.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$PROJECT_DIR/data/logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$PROJECT_DIR/scripts/serve.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/data/logs/app.log</string>
    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/data/logs/app.err.log</string>
</dict>
</plist>
EOF

# Reload if already present, then start. bootout is async, so wait for the
# label to fully unload before bootstrapping again (avoids EIO races).
DOMAIN="gui/$(id -u)"
if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  for _ in $(seq 1 20); do
    launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break
    sleep 0.5
  done
fi
launchctl bootstrap "$DOMAIN" "$PLIST"

echo "Installed $LABEL"
echo "Serving on port 7319 (auto-starts on login, restarts on crash)."
echo "Logs: $PROJECT_DIR/data/logs/app.log"
