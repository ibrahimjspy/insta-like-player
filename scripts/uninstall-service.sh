#!/bin/bash
# Stops and removes the Insta Like Player launchd agent.
#
# Usage:  bash scripts/uninstall-service.sh

set -euo pipefail

LABEL="com.instalikeplayer.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"

echo "Removed $LABEL. The app is no longer running or auto-starting."
