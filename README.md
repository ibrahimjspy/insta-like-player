# Insta Like Player

Turn your Instagram **liked Reels** into a personal, searchable, scrollable video
library. Import your likes from Instagram's official data export, download the
media locally, and browse everything in a clean web app — a continuous vertical
feed, full-text search, creator filters, favorites, and custom collections.

> Personal project. Not affiliated with Instagram. Use it only with your own
> account data and respect creators' copyright.

## How it works

```
liked_posts.json  ──►  ingest  ──►  PostgreSQL  ◄──  sync (yt-dlp)  ──►  /data/media
                                        │
                                        ▼
                                   Next.js web app
                          Reader (/)  ·  Admin (/admin)
```

1. **Import** — Instagram's "Download Your Information" gives you a
   `liked_posts.json`. The ingest step parses it into the database. No manual
   link copying.
2. **Sync** — a worker runs [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) to
   download each reel's video + thumbnail + metadata into `data/media`.
3. **Browse** — the reader app plays your downloaded reels.

There are **two areas**:

- **Reader (`/`)** — the feed, search, collections, favorites.
- **Admin (`/admin`)** — import the export, run/monitor syncs, manage reels.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS · PostgreSQL · Prisma 7 ·
`yt-dlp` · Docker Compose.

## Prerequisites

- Node.js 20+
- Docker (for Postgres) — or your own PostgreSQL instance
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp): `brew install yt-dlp` (macOS)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # edit if your Postgres port/credentials differ

# 3. Start Postgres and apply the schema
npm run db:up
npm run db:push

# 4. Run the app
npm run dev                 # http://localhost:3000  (reader)
                            # http://localhost:3000/admin
```

## Getting your liked reels into the library

### Step 1 — Export your likes from Instagram

1. Instagram → **Settings → Accounts Center → Your information and permissions →
   Download your information**.
2. **Download or transfer information** → your account → **Some of your information**.
3. Under **Your Instagram activity**, select **Likes** only.
4. **Format: JSON**, **Date range: All time** → submit.
5. When the ZIP is ready, extract `your_instagram_activity/likes/liked_posts.json`.

### Step 2 — Import + download

Either through the **Admin** UI (upload the JSON, then click *Sync*), or via the CLI:

```bash
npm run ingest -- path/to/liked_posts.json   # load likes into the DB
npm run sync                                  # download media with yt-dlp
```

Useful sync flags:

```bash
npm run sync -- --limit 50      # only the next 50 pending reels
npm run sync -- --retry         # also re-attempt previously failed reels
```

## Configuration

All config lives in `.env` (see `.env.example`) and is loaded through a single
typed module at `src/lib/config.ts`:

| Variable             | Default                | Description                                  |
| -------------------- | ---------------------- | -------------------------------------------- |
| `DATABASE_URL`       | local Postgres         | PostgreSQL connection string                 |
| `MEDIA_DIR`          | `./data/media`         | Where downloaded videos/thumbnails are saved |
| `FEED_PAGE_SIZE`     | `10`                   | Reels loaded per feed page                   |
| `YTDLP_PATH`         | `yt-dlp`               | Path to the yt-dlp binary                    |
| `YTDLP_COOKIES_FILE` | _(unset)_              | Optional Netscape cookies.txt for reliability |
| `SYNC_CONCURRENCY`   | `1`                    | Parallel downloads                           |
| `SYNC_RATE_LIMIT_MS` | `4000`                 | Delay between downloads (be polite)          |
| `SYNC_MAX_RETRIES`   | `3`                    | Retries per reel                             |

### yt-dlp cookies (optional but recommended)

Instagram rate-limits anonymous requests. Export a `cookies.txt` from a
logged-in browser session (e.g. with a "Get cookies.txt" extension), then set
`YTDLP_COOKIES_FILE=./data/cookies.txt`. The file is gitignored.

## Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Start the Next.js dev server             |
| `npm run build`      | Production build                         |
| `npm test`           | Run the Vitest test suite                |
| `npm run test:watch` | Run tests in watch mode                  |
| `npm run lint`       | Run ESLint                               |
| `npm run ingest`     | Import a `liked_posts.json` export       |
| `npm run sync`       | Download pending reels via yt-dlp        |
| `npm run db:up`      | Start the Postgres container             |
| `npm run db:down`    | Stop the Postgres container              |
| `npm run db:push`    | Apply the Prisma schema to the database  |
| `npm run db:studio`  | Open Prisma Studio                       |
| `npm run serve`      | Production server on port 7319 (all interfaces) |

## Project structure

```
prisma/schema.prisma      Data model (reels, creators, collections, …)
prisma.config.ts          Prisma 7 datasource config
scripts/ingest.ts         CLI: liked_posts.json -> DB
scripts/sync.ts           CLI: yt-dlp downloader
src/lib/                  config, db, queries, ingest/sync core, helpers
src/app/(reader)/         Reader UI: feed, search, collections, favorites
src/app/admin/            Admin UI: dashboard, reels table
src/app/api/              Media streaming + feed + admin endpoints
src/components/           Shared React components
```

## Handing off to another machine / AI agent

For a single self-contained context dump (cookie workflow, the download
pipeline, current state, ops, and gotchas) suitable to hand to a new contributor
or AI agent, see **[HANDOFF.md](./HANDOFF.md)**.

## Deploying / self-hosting

To run this as an always-on personal server you can reach from your phone and
other devices over a private [Tailscale](https://tailscale.com) network (no
cloud, no exposed data, free), see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Quick version:

```bash
npm run build
bash scripts/install-service.sh        # always-on launchd service on port 7319
tailscale serve --bg 7319              # private HTTPS URL for all your devices
```

## Testing

Unit tests live next to their source as `*.test.ts` and run under
[Vitest](https://vitest.dev):

```bash
npm test            # run once
npm run test:watch  # watch mode
```

The suite covers the core logic — URL/hashtag parsing, export parsing and
idempotent import, feed pagination and search filters, media path safety, and
the yt-dlp argument/output helpers. Database access is mocked, so no Postgres or
network is required to run the tests.

## Legal & privacy notes

- Only use this with **your own** liked content. It does not access private
  content you couldn't otherwise view.
- Downloaded media and your export are stored locally in `data/` and are
  gitignored — nothing personal is committed.
- Automated access to Instagram may conflict with their Terms of Service. This
  project uses the **official data export** for discovery (no scraping) and
  `yt-dlp` only for fetching media you already liked. Use at your own risk.

## Roadmap ideas

- Playwright-based auto-sync of new likes (behind a flag)
- Resume-from-last-position in the feed
- Tag/auto-categorize reels into collections
