# Project Handoff — Insta Like Player

A complete context dump for whoever (human or AI agent) picks this up on another
machine. Read this top to bottom; it links to the deeper docs where useful.

Companion docs: **[README.md](./README.md)** (overview), **[CLAUDE.md](./CLAUDE.md)**
(architecture & conventions), **[DEPLOYMENT.md](./DEPLOYMENT.md)** (self-hosting).

---

## 1. What this is

A **personal, single-user, web-only** app that turns a user's **Instagram liked
Reels** into a private, searchable, TikTok-style video library.

Flow: Instagram data export → **ingest** (metadata into Postgres) → **sync**
(download videos with `yt-dlp`) → **Next.js web app** (vertical feed, search,
collections, favorites). There's a **reader** UI at `/` and an **admin** UI at
`/admin`.

Stack: Next.js 16 (App Router, TS, Tailwind v4), PostgreSQL + Prisma 7 (with the
`@prisma/adapter-pg` driver adapter), `yt-dlp` + `ffmpeg` for downloads, Docker
for Postgres. Tests run on Vitest.

**It is NOT deployed to the cloud.** Intended hosting = local Mac + Tailscale
(serverless can't run yt-dlp or hold the media). See DEPLOYMENT.md.

---

## 2. Current state

> ⚠️ **If you're on a NEW machine, your state is FRESH/EMPTY.** The repo carries
> only code — no library data. There is no database, no downloaded videos, and
> no running service until you complete the setup in section 6. Don't assume any
> reels exist yet; you must create the DB, import an export, and run a sync.

What the repo gives you out of the box:
- The full app, scripts, and tests (Vitest; lint + typecheck clean).
- **No** library data — `data/` (videos, `liked_posts.json`, `cookies.txt`),
  the database, and the launchd service are all **machine-local and gitignored**.

For reference, the original/source machine had ~1,005 reels imported (with a
portion downloaded) and was running as a `launchd` service on **port 7319** via
Tailscale. A fresh machine reproduces this by following section 6 — optionally
copying the source machine's data (section in DEPLOYMENT.md) or starting clean
with a new export.

---

## 3. The cookie workflow (REQUIRED for downloading)

Instagram gates reel media behind login, so `yt-dlp` needs the owner's session
cookies to download reliably. Discovery (the list of likes) comes from the
official export and needs no cookies; only the **download** step does.

### How to obtain `cookies.txt`
1. Install a browser extension that exports cookies in **Netscape format**,
   e.g. **"Get cookies.txt LOCALLY"** (open source, local-only).
2. Log into **instagram.com** in that browser.
3. With instagram.com open, use the extension → **Export** as **cookies.txt**
   (Netscape format, NOT JSON).
4. Save it to the project at **`data/cookies.txt`**.

A valid file:
- starts with `# Netscape HTTP Cookie File`,
- contains Instagram cookies including **`sessionid`**, **`ds_user_id`**, and
  **`csrftoken`**.

Validate quickly (replace with any reel the account can view):

```bash
yt-dlp --cookies data/cookies.txt -o "data/_test.%(ext)s" \
  "https://www.instagram.com/reel/SHORTCODE/"
# success = an .mp4 appears in data/. Then: rm data/_test.*
```

### Wire it into the app
In `.env`:

```bash
YTDLP_COOKIES_FILE="./data/cookies.txt"
```

The sync worker passes this to yt-dlp via `--cookies` (see
`buildYtDlpArgs` in `src/lib/sync.ts`).

### Security & account-safety notes
- `cookies.txt` is a live session credential (≈ a password). It's **gitignored**
  (`data/` is ignored). Never commit, share, or sync it to cloud.
- Logging out of that browser session, or changing the password, invalidates it.
- Automated bulk downloading on a **main account** carries mild risk
  (rate-limit / checkpoint, rarely a ban). Mitigate with the polite defaults:
  sequential downloads (one at a time) with `SYNC_RATE_LIMIT_MS` ≥ 4000 (we used
  2000–6000), and downloading in batches rather than thousands at once. Downloads
  are read-only traffic; the app never likes/follows/posts.

---

## 4. How downloading works (ingest + sync)

### Step A — Get the export from Instagram (no scraping)
Instagram → Settings → **Accounts Center** → **Your information and permissions**
→ **Download your information** → **Some of your information** → check **Likes**
→ **Format: JSON**, **All time** → submit. Download the ZIP when ready and find
**`liked_posts.json`** (under a `likes/` folder).

### Step B — Ingest (metadata → DB)
```bash
npm run ingest -- data/liked_posts.json
```
- Parser: `src/lib/ingest.ts` (`parseLikedPosts`). It supports **two export
  shapes**:
  - **Current**: top-level array of `{ timestamp, label_values: [...] }` where
    `label_values` carries `URL`, `Caption`, and a nested `Owner → Username`.
  - **Legacy**: `{ likes_media_likes: [ { title, string_list_data:[{href,timestamp}] } ] }`.
- Extracts shortcode, canonical reel URL, creator, caption, hashtags, liked-at.
- **Idempotent**: existing shortcodes are skipped, so re-importing never
  clobbers download status. Each new reel starts as `PENDING`.

### Step C — Sync (download videos)
```bash
npm run sync                 # all PENDING reels
npm run sync -- --limit 50   # next 50 only
npm run sync -- --retry      # also re-attempt FAILED reels
```
- Core: `src/lib/sync.ts`. For each reel it shells out to `yt-dlp`, saving
  `data/media/<shortcode>.mp4` + `.jpg` (thumbnail) + `.info.json` (metadata).
- Reads metadata to fill caption/creator/duration/dimensions, parses hashtags.
- Sets status to `DOWNLOADED`, or `FAILED` (transient — retryable) or
  `UNAVAILABLE` (deleted/private — not worth retrying). Errors are recorded in
  `failReason`; a failure never stops the run.
- Rate-limited and **resumable** — rerun `npm run sync` to continue.
- Needs `yt-dlp` (`brew install yt-dlp`) and ideally `ffmpeg`
  (`brew install ffmpeg`) for best quality + thumbnail conversion.

### Reel statuses
`PENDING` → not yet downloaded · `DOWNLOADED` → playable · `FAILED` → transient
error, retryable · `UNAVAILABLE` → gone/private · `SKIPPED` → user chose "don't
import"; excluded from the feed and never re-downloaded.

### Admin alternative
`/admin` can upload the export (`/api/admin/import`) and run the sync with a live
progress bar (`/api/admin/sync` + `src/lib/sync-runner.ts`, in-process state).
The reader feed only ever shows `DOWNLOADED` reels. **For you** (`?order=random`) is a
personalized ranker — see [docs/FEED_RECOMMENDATIONS.md](./docs/FEED_RECOMMENDATIONS.md)
and `src/lib/feed/config.ts` for tuning.

---

## 5. How media is served

- Videos/thumbnails are streamed by `src/app/api/media/[type]/[shortcode]/route.ts`
  from `data/media`, with **HTTP range support** (seeking). The browser only ever
  references media by shortcode (`/api/media/video/<shortcode>`); absolute file
  paths are never exposed.
- Instagram CDN URLs expire, which is why videos are downloaded to disk rather
  than hot-linked.

---

## 6. Setup on a new Mac (summary)

Full detail in **DEPLOYMENT.md**. Short version:

```bash
brew install node yt-dlp ffmpeg            # + Docker Desktop + Tailscale
git clone <repo> insta-like-player && cd insta-like-player && npm install
cp .env.example .env                       # adjust DB port if 5432 is taken
npm run db:up && npm run db:push           # Postgres in Docker + schema

# data: either copy from the old Mac (rsync data/media + pg_dump/restore),
#       or start fresh: drop liked_posts.json in data/ and:
npm run ingest -- data/liked_posts.json
# add data/cookies.txt + set YTDLP_COOKIES_FILE, then:
npm run sync

npm run build && bash scripts/install-service.sh   # always-on on port 7319
tailscale serve --bg 7319                           # private HTTPS URL
```

---

## 7. Key gotchas / things to know

- **Prisma 7**: no `url` in `schema.prisma`; the connection URL lives in
  `prisma.config.ts` (CLI) and the runtime client uses `@prisma/adapter-pg`
  (`src/lib/db.ts`). Don't add `url` back.
- **Local Postgres port**: `.env.example` uses the standard `5432`. The owner's
  machine had a conflict and uses `5433` — keep `DATABASE_URL` and
  `POSTGRES_PORT` in sync per machine.
- **App port** is **7319** (chosen to avoid collisions). Defined in the `serve`
  script in `package.json` and the launchd agent.
- **Config**: all tunables go through `src/lib/config.ts` (typed, env-backed) and
  `.env.example`. Don't read `process.env` directly elsewhere.
- **Tests**: `*.test.ts` next to source; `npm test`. Prisma is mocked, so no DB
  is needed to run them. Run after touching anything in `src/lib`.
- **Legal/scope**: only operate on the owner's own exported data; no scraping or
  login automation by default. A Playwright auto-sync is a possible future,
  opt-in, flagged feature — not built.

---

## 8. Possible next steps (not yet built)

- Finish downloading remaining reels (`npm run sync`).
- "Reset / delete all" button in Admin for clean re-tests.
- `gallery-dl` fallback engine if yt-dlp failures rise at scale.
- Resume-from-last-position in the feed.
- Optional Playwright incremental auto-sync of new likes (flagged).
