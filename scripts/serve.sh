#!/bin/bash
# Launcher used by the launchd agent (and runnable by hand).
# Starts the production server on port 7319, bound to all interfaces so it's
# reachable over the Tailscale network. `caffeinate -i` keeps the Mac from
# idle-sleeping while the server runs (remove it if you don't want that).

set -euo pipefail

# Homebrew node/npm aren't on launchd's minimal PATH, so add them.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$(dirname "$0")/.."

exec caffeinate -i npm run serve
