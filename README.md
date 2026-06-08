# Like Player

**Turn your liked videos into a private, searchable, TikTok-style library.**

Import likes from Instagram, TikTok, and Facebook using each platform's official
data export. Download the media locally with `yt-dlp`. Browse everything in a
fast web app — vertical feed, full-text search, favorites, and custom collections.

Not affiliated with Meta, ByteDance, or any social platform. Use only with **your
own** exported data.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/ibrahimjspy/insta-like-player/actions/workflows/ci.yml/badge.svg)](https://github.com/ibrahimjspy/insta-like-player/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)

<p align="center">
  <img src="docs/media/demo.gif" alt="Like Player — vertical For you feed" width="300"><br>
  <sub><b>For you feed</b> — vertical, snap-scrolling, ranked by your watch behavior</sub>
</p>

---

## Screenshots

<p align="center"><b>Search</b> — caption, creator, or hashtag, filtered by platform</p>
<p align="center"><img src="docs/media/search.png" alt="Search with platform pills and creator chips" width="100%"></p>

<p align="center"><b>Admin dashboard</b> — library stats, per-platform import, and live sync</p>
<p align="center"><img src="docs/media/admin.png" alt="Admin dashboard" width="100%"></p>

<p align="center"><b>Collections</b> — curate subsets without touching the original platforms</p>
<p align="center"><img src="docs/media/collections.png" alt="Collections" width="100%"></p>

---

## Contents

[Why this exists](#why-this-exists) ·
[How it works](#how-it-works) ·
[Features](#features) ·
[Supported platforms](#supported-platforms) ·
[Quick start](#quick-start) ·
[Configuration](#configuration) ·
[FAQ](#faq) ·
[Roadmap](#roadmap) ·
[Self-hosting](#self-hosting) ·
[Legal & privacy](#legal--privacy)

---

## Why this exists

Social platforms bury your likes in export ZIPs and expired CDN links. Like Player
gives you:

- **One library** for Instagram Reels, TikTok videos, and Facebook saved/reacted videos
- **Local files** — no streaming from expired URLs; seekable playback from disk
- **A real feed** — Recent, Oldest, or a **For you** ranker that learns from watch time
- **Search** — caption, creator, hashtag, and platform filters
- **Collections & favorites** — curate subsets without touching the original platforms
- **Self-hosted** — single-user, runs on your machine; optional Tailscale access from your phone

No scraping. No login automation. Discovery comes from official exports; downloads
use `yt-dlp` with optional session cookies you provide.

### Why not just keep the export?

| Instead of… | …you get with Like Player |
|-------------|---------------------------|
| A `liked_posts.json` you'll never open again | A scrollable, watchable feed of the actual videos |
| Saves & bookmarks that vanish when posts are deleted | Local copies that survive takedowns and expired CDN links |
| A folder of `yt-dlp` files named by ID | Captions, creators, hashtags, search, and collections |
| Re-finding things at the algorithm's whim | A **For you** feed ranked by *your* watch behavior |

---

## How it works

```
Platform export (JSON)  ──►  ingest  ──►  PostgreSQL  ◄──  sync (yt-dlp)  ──►  data/media
                                              │
                                              ▼
                                         Next.js web app
                               Reader (/)  ·  Admin (/admin)
```

| Step | What happens |
|------|----------------|
| **Import** | Parse `liked_posts.json`, `user_data_tiktok.json`, or Facebook `posts_and_comments.json` / saved collections into the DB |
| **Sync** | Download video + thumbnail + metadata for each pending item |
| **Browse** | Stream from `/api/media/...` with HTTP range support (scrubbing works) |

---

## Features

### Reader (`/`)

- Infinite vertical feed with tap-to-pause chrome
- Sort: **Recent** · **Oldest** · **For you** (personalized from watch behavior)
- Auto-scroll and video-only modes while paused
- Search by text, creator, or platform
- Favorites and user-defined collections

### Admin (`/admin`)

- Upload exports per platform
- Run and monitor background sync
- Inspect reel status (pending, downloaded, failed, unavailable)

### For you feed

Not random — ranks reels from engagement signals (watch time, loops, deep watches
vs quick skips, creator/hashtag/collection affinity). Tune weights in
`src/lib/feed/config.ts`. Design doc: [docs/FEED_RECOMMENDATIONS.md](docs/FEED_RECOMMENDATIONS.md).

---

## Supported platforms

| Platform | Export file | CLI flag |
|----------|-------------|----------|
| Instagram | `liked_posts.json` (Likes, JSON, all time) | `--platform instagram` (default) |
| TikTok | `user_data_tiktok.json` (include **Likes**) | `--platform tiktok` |
| Facebook | `likes_and_reactions/posts_and_comments.json`, saved collections, or `your_saved_items.json` | `--platform facebook` |

Each platform uses the same pipeline; media is stored as
`<platform>_<id>.mp4` (Instagram keeps bare shortcodes for backward compatibility).

---

## Quick start

**Prerequisites:** Node.js 20+, Docker (for Postgres), [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)

```bash
git clone https://github.com/ibrahimjspy/insta-like-player.git
cd insta-like-player
npm install

cp .env.example .env          # edit DATABASE_URL if port 5432 is taken
npm run db:up && npm run db:push
npm run dev                   # http://localhost:3000
```

### Import your likes

**Admin UI:** open `/admin` → pick platform → upload JSON → Sync.

**CLI:**

```bash
# Instagram (default)
npm run ingest -- path/to/liked_posts.json

# TikTok
npm run ingest -- --platform tiktok path/to/user_data_tiktok.json

# Facebook
npm run ingest -- --platform facebook path/to/posts_and_comments.json

npm run sync                  # download pending media
npm run sync -- --limit 50    # batch of 50
npm run sync -- --retry       # include previously failed reels
```

### Cookies (recommended for downloads)

Platforms gate media behind login. Export a Netscape `cookies.txt` from a
logged-in browser session and set per-platform paths in `.env`:

```bash
YTDLP_COOKIES_INSTAGRAM="./data/cookies-instagram.txt"
YTDLP_COOKIES_TIKTOK="./data/cookies-tiktok.txt"
YTDLP_COOKIES_FACEBOOK="./data/cookies-facebook.txt"
```

TikTok often needs browser impersonation — see comments in `.env.example`.

---

## Configuration

All settings flow through `.env` → `src/lib/config.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | local Docker Postgres | PostgreSQL connection string |
| `MEDIA_DIR` | `./data/media` | Downloaded videos and thumbnails |
| `FEED_PAGE_SIZE` | `10` | Reels per infinite-scroll page |
| `YTDLP_PATH` | `yt-dlp` | Path to yt-dlp binary |
| `YTDLP_COOKIES_*` | _(unset)_ | Per-platform Netscape cookies |
| `YTDLP_IMPERSONATE_TIKTOK` | `chrome` | TLS fingerprint for TikTok 403s |
| `SYNC_RATE_LIMIT_MS` | `4000` | Delay between sequential downloads |
| `SYNC_MAX_RETRIES` | `3` | Retries before marking FAILED |
| `SYNC_REELS_ONLY` | `true` | Skip non-video likes (e.g. Instagram `/p/` photos) |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build + typecheck |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run ingest` | Import a platform export |
| `npm run sync` | Download pending reels |
| `npm run db:up` / `db:down` | Start/stop Postgres container |
| `npm run db:push` | Apply Prisma schema |
| `npm run serve` | Production server on port 7319 |

---

## Project structure

```
prisma/schema.prisma       Reels, creators, hashtags, collections, engagement
src/lib/platforms/         Instagram, TikTok, Facebook export parsers
src/lib/feed/              For you scoring, taste classification, SQL ranker
src/lib/queries.ts         Feed, search, collections, favorites
src/app/(reader)/          Feed, search, collections, favorites
src/app/admin/             Import, sync, reel management
src/app/api/media/         Local media streaming with range requests
docs/                      FEED_RECOMMENDATIONS.md, DEPLOYMENT.md
```

---

## Self-hosting

Run as an always-on personal server and reach it from your phone over
[Tailscale](https://tailscale.com) — no cloud, no public exposure. See
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

```bash
npm run build
bash scripts/install-service.sh   # macOS launchd agent on port 7319
tailscale serve --bg 7319         # private HTTPS on your tailnet
```

---

## Testing

```bash
npm test            # full suite
npm test -- src/lib/feed   # after feed algorithm changes
```

Tests cover export parsers (all three platforms), feed pagination and scoring,
search filters, media path safety, and yt-dlp helpers. Prisma is mocked — no DB
required.

---

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · PostgreSQL · Prisma 7 ·
`yt-dlp` · Docker Compose · Vitest

---

## FAQ

**Will my account get banned?**
Downloads are read-only and rate-limited — sequential, one at a time, with
`SYNC_RATE_LIMIT_MS` ≥ 4000 by default. The app never likes, follows, comments,
or posts. As with any `yt-dlp` use there's mild risk on a main account; go slow,
or use a throwaway session for the cookies.

**Is this legal?**
You only process **your own** exported data and download content you already
liked. The app doesn't bypass access controls or scrape. Automated downloading
may still conflict with a platform's Terms of Service — use at your own risk.

**Do I need cookies?**
For discovery, no — the official export already lists your likes. For
*downloading*, most platforms gate media behind login, so a Netscape
`cookies.txt` makes sync far more reliable. TikTok also often needs browser
impersonation (see `.env.example`).

**Does it run on Windows / Linux?**
Yes — it's Node + Docker + `yt-dlp`. Only the always-on service scripts
(`launchd`) are macOS-specific; on Linux run `npm run serve` under systemd.
Everything else is cross-platform.

**Why Postgres instead of SQLite?**
The **For you** ranker runs a single scoring SQL query per page over engagement
rollups; Postgres keeps that fast with a clean schema, and Docker Compose makes
it one command to start.

**Does it download photos too?**
By default it fetches videos only (`SYNC_REELS_ONLY=true`) and skips photo posts.
Set it to `false` to attempt everything.

**Can it auto-sync new likes?**
Not by default — discovery is export-based to stay scraping-free. An opt-in,
flagged Playwright auto-sync is on the roadmap.

---

## Legal & privacy

- Only use with **your own** exported data. The app does not bypass platform access controls.
- Media and exports live in `data/` (gitignored). Nothing personal belongs in git.
- Automated downloading may conflict with platform Terms of Service. Discovery uses
  official exports; downloads are read-only fetches of content you already liked.
  **Use at your own risk.**

---

## Roadmap

- [ ] Resume-from-last-position in the feed
- [ ] Auto-tagging and smart collections
- [ ] Opt-in, flagged Playwright auto-sync of new likes
- [ ] `gallery-dl` fallback engine for stubborn downloads
- [ ] One-click "reset library" in Admin

Have an idea? [Open an issue](https://github.com/ibrahimjspy/insta-like-player/issues)
or send a PR — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). For AI-assisted
development, see [CLAUDE.md](CLAUDE.md). Found a security issue? See
[SECURITY.md](SECURITY.md). Notable changes are tracked in
[CHANGELOG.md](CHANGELOG.md).

If this project saves you from losing liked videos to the algorithm, consider
**starring the repo** — it helps others find it.

## License

[MIT](LICENSE)
