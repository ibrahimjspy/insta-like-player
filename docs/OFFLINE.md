# Offline mode

Offline mode keeps a private, playable pocket of Like Player videos on your
phone. The Mac remains the source of truth and continues to handle imports,
`yt-dlp`, PostgreSQL, and the full media library.

## Setup and use

1. Run the production app (`npm run serve` or the launchd service).
2. Open its HTTPS Tailscale URL on the phone.
3. Use **Share → Add to Home Screen**.
4. While the Mac is reachable, open **Admin → Phone playback** and tap
   **Refresh this device**.
5. Disconnect Tailscale and open the normal **Feed**.

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

Admin shows the current video count, storage usage, and refresh progress.
Cached reels display an **Offline** badge while browsing online.

## How it works

- `/api/offline/candidates` returns eligible IG/TikTok metadata and file sizes.
- IndexedDB stores reel metadata, thumbnails, and full video `Blob`s locally.
- Offline playback uses local `blob:` URLs, so seeking works without HTTP range
  requests or access to the Mac.
- The service worker caches only the static `/` feed shell and its Next.js
  assets. It deliberately does not cache `/api/*` or video responses.
- Browser persistent-storage permission is requested when syncing, when
  supported.

All offline data remains on that phone and is not uploaded to a cloud service.
Clearing site data, uninstalling the PWA, or browser storage eviction can remove
the pocket; reconnect and refresh it from Admin to recreate it.

## Seamless feed behavior

The installed app always starts at `/`. It probes the Mac with a lightweight
request:

- **Mac reachable:** the Feed uses live API data, pagination, collections, and
  new videos normally.
- **Mac unreachable:** the same Feed automatically reads saved records and
  video blobs from IndexedDB. No separate offline viewer is needed.

Search, collections, favorites, Admin, and server-backed reel actions are
disabled while disconnected. Playback, scrolling, seeking, mute, and
auto-scroll remain local and continue working.

## Limitations

- A connection to the Mac over LAN or Tailscale is still required to refresh.
- Search, collections, favorites, and Admin remain server-backed.
- Automatic refresh only runs after the first manual sync.
- Available browser storage can be lower than 2 GB. Sync stops cleanly if the
  device reports that its quota is full.
