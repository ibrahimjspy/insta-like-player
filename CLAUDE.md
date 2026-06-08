# CLAUDE.md

Guidance for AI coding agents (and humans) working in this repository.

## What this project is

**Like Player** turns a user's liked videos from **Instagram, TikTok, and Facebook**
into a personal, searchable, scrollable web library. It is a **single-user,
locally-run, web-only** app (no mobile app, no multi-tenant auth).

Pipeline: platform data export → ingest → PostgreSQL → `yt-dlp` download →
Next.js web app (reader + admin).

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # production build (also full type-check)
npm test             # run Vitest suite once
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint

npm run ingest -- [--platform instagram|tiktok|facebook] <export.json>
npm run sync                            # download pending reels via yt-dlp
npm run sync -- --limit 50              # only next 50
npm run sync -- --retry                 # also re-attempt FAILED reels

npm run db:up        # start Postgres (docker compose)
npm run db:push      # apply Prisma schema
npm run db:studio    # Prisma Studio

npm run serve                       # prod server on port 7319 (all interfaces)
bash scripts/install-service.sh     # always-on launchd agent (auto-start/restart)
bash scripts/uninstall-service.sh   # remove the launchd agent
```

## Deployment (self-hosted, private)

Intended deployment is **local + Tailscale**, not a cloud platform (the sync
worker needs yt-dlp + a real disk, which serverless hosts like Vercel can't
provide). The app runs as a `launchd` agent on **port 7319** and is exposed to
the user's private tailnet via `tailscale serve`. Full instructions:
[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). Library data (media + DB) is
per-machine and gitignored; moving machines means copying `data/media` + a
pg_dump, or re-running ingest/sync.

After editing files, run `npm run lint` and (for type safety) `npm run build`
or `npx tsc --noEmit`. Run `npm test` after touching anything in `src/lib`.

## Architecture

```
prisma/schema.prisma         Data model (Reel, Creator, Hashtag, Collection, …)
prisma.config.ts             Prisma 7 datasource config (CLI uses this)
scripts/ingest.ts            CLI wrapper around src/lib/ingest
scripts/sync.ts              CLI wrapper around src/lib/sync

src/lib/
  config.ts                  Single typed config object (zod + env). Import this
                             instead of reading process.env anywhere.
  db.ts                      PrismaClient singleton (Prisma 7 + pg adapter)
  platforms/                 Multi-platform export parsers + URL helpers
    index.ts                 parseExport(), sureShotVideoWhere(), exportHint()
    facebook.ts              Facebook reactions, saves, collections.json
    tiktok.ts                TikTok user_data_tiktok.json likes
    types.ts                 ParsedLike, PLATFORM_*, mediaStorageKey()
  feed/                      **For you** personalized feed (see below)
  instagram.ts               Instagram URL/shortcode/hashtag parsing (pure)
  ingest.ts                  importLikes() — platform-agnostic DB upsert
  sync.ts                    yt-dlp downloader + pure helpers
  sync-runner.ts             In-process background sync state for the admin UI
  queries.ts                 All read queries (feed, search, collections, stats)
  media.ts                   Media path resolution + content types (pure-ish)
  types.ts                   Client-safe types + media URL builders

src/app/(reader)/            Reader UI: / (feed), /search, /collections, /favorites
src/app/admin/               Admin UI: dashboard + /admin/reels table
src/app/actions.ts           Reader server actions (favorites, collections, watch)
src/app/admin/actions.ts     Admin server actions (retry, delete reel)
src/app/api/
  media/[type]/[platform]/[shortcode]   Streams local media with HTTP range support
  reels                                   Feed pagination JSON
  admin/import                            Upload + ingest platform export
  admin/sync                              Start / poll the background sync

src/components/              React components (Sidebar, ReelFeed, ReelGrid, …)
```

### Data flow

1. **Ingest** (`src/lib/ingest.ts` + `src/lib/platforms/`): `parseExport(platform, json)`
   → upsert `Reel` rows with `status = PENDING`. Idempotent on `(platform, shortcode)`.
2. **Sync** (`src/lib/sync.ts`): for each `PENDING` reel, shell out to `yt-dlp`,
   save media into `MEDIA_DIR` (Instagram: `<shortcode>.mp4`; others:
   `<platform>_<id>.mp4`), read metadata, set `DOWNLOADED` / `FAILED` / `UNAVAILABLE`.
3. **Read** (`src/lib/queries.ts`): the reader only ever shows `DOWNLOADED` reels.

### Multi-platform ingest

| Platform | Parser | Typical export |
|----------|--------|----------------|
| INSTAGRAM | `parseInstagramLikes` | `liked_posts.json` |
| TIKTOK | `parseTikTokLikes` | `user_data_tiktok.json` |
| FACEBOOK | `parseFacebookLikes` | `posts_and_comments.json`, `collections.json`, `your_saved_items.json` |

Admin import and CLI both accept `--platform`. Per-platform cookies and yt-dlp
impersonation live in `config.ts` (`YTDLP_COOKIES_*`, `YTDLP_IMPERSONATE_*`).
TikTok often needs impersonation (`curl_cffi`-enabled yt-dlp build).

### Search

`searchReels()` in `queries.ts` — case-insensitive `contains` on caption,
creator username, and hashtags; optional `platform` and exact `creator` filters.
Search UI: `src/app/(reader)/search/page.tsx` with platform pills and creator
chips from `getCreatorsWithCounts()`.

### For you feed (`order=random`)

UI label **For you**; URL stays `?order=random`. Not pure random — ranks reels from
`ReelEngagement` (watch time, loops, deep/skip signals, creator/tag/collection taste).

| What | Where |
|------|--------|
| Tune weights / thresholds | `src/lib/feed/config.ts` |
| Session classification (pure) | `src/lib/feed/taste.ts` |
| Scoring SQL (one query per page) | `src/lib/feed/sql.ts` |
| DB rollup writes | `src/lib/feed/engagement.ts` |
| Design doc | [docs/FEED_RECOMMENDATIONS.md](./docs/FEED_RECOMMENDATIONS.md) |

Import from `@/lib/feed` (not scattered `@/lib/engagement` / `@/lib/smart-feed`).
After changing feed logic: `npm test -- src/lib/feed` (and `queries.test.ts` if
`getFeed` changed). Player sends watch metrics via `recordWatch` / `flushWatchTime`
in `src/app/actions.ts`; infinite scroll passes `exclude` reel ids to avoid repeats.
Feed chrome: `VideoOnlyToggle`, `AutoScrollToggle` in `FeedPageClient.tsx`.

## Conventions

- **Config**: everything tunable goes through `src/lib/config.ts` (typed, with
  defaults) and is documented in `.env.example`. Don't read `process.env`
  directly elsewhere.
- **Core logic in `src/lib`**, thin wrappers in `scripts/` (CLI) and
  `src/app/api/` (HTTP). Keep business logic out of route handlers/components.
- **Pure functions are exported and unit-tested** (e.g. `parseInstagramLikes`,
  `parseFacebookLikes`, `extractShortcode`, `classifyOutputs`, `buildYtDlpArgs`,
  `isUnavailable`, `resolveMediaPath`, `classifyWatchSession` in
  `src/lib/feed/taste.ts`). When adding logic, prefer a pure helper + a test.
- **Mutations** use Next server actions (`*/actions.ts`) with `revalidatePath`.
  **Reads** use server components calling `src/lib/queries.ts`.
- **Media is referenced by platform + shortcode** on the client
  (`/api/media/video/<platform>/<shortcode>`). Never expose absolute file paths.
- **Tests** live next to source as `*.test.ts` and run under Vitest (node env).
  Prisma is mocked via `vi.mock("@/lib/db", ...)`; no DB is needed for tests.

## Important gotchas

- **Prisma 7** removed `url` from `schema.prisma`. The connection URL lives in
  `prisma.config.ts` (CLI) and the runtime client uses the **`@prisma/adapter-pg`
  driver adapter** in `src/lib/db.ts`. Don't add `url` back to the schema.
- **`yt-dlp` is a runtime dependency** for sync only (`brew install yt-dlp`).
  It is intentionally not an npm package. `buildYtDlpArgs` builds its args.
- **Platform CDN URLs expire** — media is downloaded to disk, never hot-linked.
- **Local Postgres port**: `.env.example` uses `5432`. If that port is taken on
  a machine, change `DATABASE_URL` and `POSTGRES_PORT` together.
- **Env loading for scripts**: `config.ts` calls `process.loadEnvFile()` so the
  `tsx` CLI scripts pick up `.env`. Next.js loads env itself.
- **`tsx` resolves the `@/*` path alias** from `tsconfig.json`, so scripts can
  import `@/lib/...`.
- **Background sync state** (`sync-runner.ts`) is in-process and stored on
  `globalThis`. This is deliberate for a single-user local app; it is not
  multi-process safe. The canonical, robust way to run a large sync is the CLI
  (`npm run sync`).

## Scope guardrails

In scope: importing likes (Instagram, TikTok, Facebook), downloading media, feed
(including personalized For you), search, collections, favorites, watch history /
engagement. Out of scope (V1): posting/modifying platform likes, accessing content
the user can't already see, social/sharing features.

Only operate on the user's own exported data. Don't add platform scraping/login
automation unless explicitly requested (a Playwright auto-sync is a planned,
opt-in, flagged feature — not a default).
