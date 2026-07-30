# Offline mode

Offline mode keeps a private, playable pocket of Like Player videos on your
phone. The Mac remains the source of truth and continues to handle imports,
`yt-dlp`, PostgreSQL, and the full media library.

## Setup and use

1. Run the production app (`npm run serve` or the launchd service).
2. Open its HTTPS Tailscale URL on the phone.
3. Use **Share → Add to Home Screen**.
4. Open **Offline** and tap **Refresh** while the Mac is reachable.
5. After syncing, disconnect Tailscale and use the Offline tab normally.

The first sync is manual to avoid an unexpected large download. Once a pocket
exists, the app checks for updates when connectivity returns or the app comes
back into focus. A five-minute cooldown prevents repeated refreshes.

## Sync policy

- **Platforms:** Instagram and TikTok; Facebook is always online-only.
- **Storage cap:** 2 GB of video blobs per device.
- **Per-file cap:** 80 MB; larger clips remain online-only.
- **Priority:** favorites first, then recent downloaded videos.
- **Pinned clips:** **Take offline** pins a reel so normal refreshes retain it.
- **Eviction:** lower-priority, non-favorite, non-pinned clips are removed first.

The Offline page shows the current video count and storage usage. Cached reels
also display an **Offline** badge in the feed and grids.

## How it works

- `/api/offline/candidates` returns eligible IG/TikTok metadata and file sizes.
- IndexedDB stores reel metadata, thumbnails, and full video `Blob`s locally.
- Offline playback uses local `blob:` URLs, so seeking works without HTTP range
  requests or access to the Mac.
- The service worker caches only the static `/offline` app shell and its Next.js
  assets. It deliberately does not cache `/api/*` or video responses.
- Browser persistent-storage permission is requested when syncing, when
  supported.

All offline data remains on that phone and is not uploaded to a cloud service.
Clearing site data, uninstalling the PWA, or browser storage eviction can remove
the pocket; reconnect and tap **Refresh** to recreate it.

## Limitations

- A connection to the Mac over LAN or Tailscale is still required to refresh.
- Main reader/search pages remain server-backed; `/offline` is the disconnected
  experience.
- Automatic refresh only runs after the first manual sync.
- Available browser storage can be lower than 2 GB. Sync stops cleanly if the
  device reports that its quota is full.
