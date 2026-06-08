#!/usr/bin/env bash
# Move cookies + Instagram export from ~/Downloads into data/
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/media data/logs

COOKIES_SRC="${1:-$HOME/Downloads/cookies.txt}"
if [[ -f "$COOKIES_SRC" ]]; then
  cp "$COOKIES_SRC" data/cookies.txt
  echo "OK: cookies -> data/cookies.txt"
else
  echo "Missing cookies file: $COOKIES_SRC"
  echo "Usage: $0 [path-to-cookies.txt]"
  exit 1
fi

# Prefer standard export path, then any liked_posts.json, then newest .json in Downloads
LIKED=""
for candidate in \
  "$HOME/Downloads/liked_posts.json" \
  "$HOME/Downloads/your_instagram_activity/likes/liked_posts.json" \
  $(find "$HOME/Downloads" -maxdepth 5 -name 'liked_posts.json' 2>/dev/null | head -1); do
  if [[ -f "$candidate" ]]; then
    LIKED="$candidate"
    break
  fi
done

if [[ -z "$LIKED" ]]; then
  LIKED=$(find "$HOME/Downloads" -maxdepth 3 -name '*.json' -type f 2>/dev/null \
    | while read -r f; do
        if grep -q 'likes_media_likes\|"label_values"' "$f" 2>/dev/null; then
          echo "$f"
          break
        fi
      done | head -1)
fi

if [[ -n "$LIKED" && -f "$LIKED" ]]; then
  cp "$LIKED" data/liked_posts.json
  echo "OK: likes export -> data/liked_posts.json (from $LIKED)"
else
  echo "Could not find liked_posts.json under ~/Downloads."
  echo "If your export is a ZIP, extract it first, then re-run this script"
  echo "or: cp path/to/liked_posts.json data/liked_posts.json"
  exit 1
fi

echo "Done. Next:"
echo "  npm run db:up && npm run db:push && npm run ingest -- data/liked_posts.json"
echo "  npm run sync   # downloads /reel/ and /tv/ only (skips generic /p/ posts)"
