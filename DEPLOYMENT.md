# Deployment & Self-Hosting Guide

How to run Insta Like Player as an always-on personal server and access it from
your phone and other devices over a private [Tailscale](https://tailscale.com)
network — no cloud, no exposed data, no cost.

> The app serves on **port 7319** (chosen to avoid colliding with other dev
> projects).

---

## Two ways to use it on other devices

**Option 1 — Access one always-on Mac from everywhere (simplest).**
Run the server + data on a single "home" Mac. Every other device (phone, other
Macs) just opens its Tailscale URL. No data duplication. This is the recommended
setup.

**Option 2 — Run a full copy on another Mac.**
You want the second Mac to be its own independent server. This needs the code,
the database, **and** the downloaded media copied over (see
[Moving your data](#moving-your-data-to-another-mac)).

Both use the same install steps below.

---

## Prerequisites (install once per Mac)

```bash
# Homebrew packages
brew install node yt-dlp ffmpeg

# Docker Desktop (for PostgreSQL) — https://www.docker.com/products/docker-desktop
# Tailscale (standalone build, not the App Store one) — https://tailscale.com/download/mac
```

- **Node** 20+ runs the app and scripts.
- **Docker** hosts the PostgreSQL database.
- **yt-dlp** + **ffmpeg** are only needed for *downloading* reels (the sync step).
- **Tailscale** provides private remote access.

In **Docker Desktop → Settings → General**, enable
**"Start Docker Desktop when you sign in"** so the database is up after reboots.

---

## 1. Get the project & install

```bash
git clone <your-repo-url> insta-like-player
cd insta-like-player
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if needed. Key values:

- `DATABASE_URL` — defaults to the local Docker Postgres. If port 5432 is taken
  on this Mac, change the port here **and** `POSTGRES_PORT` to match (e.g. 5433).
- `YTDLP_COOKIES_FILE="./data/cookies.txt"` — set this if you'll download here
  (see the main README for exporting Instagram cookies).
- `SYNC_RATE_LIMIT_MS` — delay between downloads (6000 = polite/safe).

## 3. Start the database & apply the schema

```bash
npm run db:up      # starts PostgreSQL in Docker (auto-restarts on boot)
npm run db:push    # creates the tables
```

## 4. Get your data

Either bring your library over from another Mac
([Moving your data](#moving-your-data-to-another-mac)), or start fresh:

```bash
npm run ingest -- data/liked_posts.json   # import your Instagram export
npm run sync                               # download media via yt-dlp
```

## 5. Build & install the always-on service

```bash
npm run build
bash scripts/install-service.sh
```

This registers a `launchd` agent that:
- serves the app on **port 7319**, bound to all interfaces,
- **auto-starts on login** and **restarts if it crashes**,
- keeps the Mac from idle-sleeping while running (`caffeinate`),
- logs to `data/logs/app.log`.

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7319/   # -> 200
```

Manage it anytime:

```bash
bash scripts/install-service.sh     # (re)install / restart
bash scripts/uninstall-service.sh   # stop & remove
tail -f data/logs/app.log           # watch logs
```

---

## 6. Tailscale: private access from anywhere

1. **Install + sign in** on this Mac (Tailscale app), and on your phone / other
   Macs — all with the **same account**. They now share a private "tailnet".
2. In the admin console ([login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns)):
   enable **MagicDNS** and click **Enable HTTPS**.
3. Publish the app at a clean HTTPS URL (run on the server Mac):

   ```bash
   tailscale serve --bg 7319
   ```

   If `tailscale` isn't on your PATH, use the bundled CLI:

   ```bash
   /Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 7319
   ```

4. Find your URL:

   ```bash
   tailscale status        # shows this machine's name
   ```

   Your app is now at **`https://<machine-name>.<tailnet>.ts.net`**.

5. On your phone, open that URL → **Share → Add to Home Screen** for an app-like
   icon. It works on cellular and any Wi-Fi, fully private to your devices.

To stop serving over Tailscale: `tailscale serve --bg --https=443 off` (or
`tailscale serve reset`).

---

## Keeping the server reachable

The app only responds while the Mac is **awake** and **Docker is running**.

- **Idle sleep** is prevented by `caffeinate` while the service runs.
- **Closing the lid** still sleeps the Mac unless it's on power **and** has an
  external display (clamshell mode). For a dedicated always-on box, keep it
  plugged in and lid open, or run:

  ```bash
  sudo pmset -c sleep 0        # never sleep while on charger
  ```

- After a reboot, both Docker (if "start on sign in" is enabled) and the app
  (via launchd) come back automatically.

---

## Moving your data to another Mac

The code is in git, but your **library data is not** (it's gitignored). To make
a second Mac a full independent server, copy two things from the source Mac.

**a) Downloaded media** — copy the whole media folder:

```bash
# on the new Mac, from the project root:
rsync -av <source-mac>:~/Desktop/insta-like-player/data/media/ data/media/
```

**b) The database** — dump on the source Mac, restore on the new one:

```bash
# SOURCE Mac — dump (adjust port if you changed it):
docker exec insta_like_player_db pg_dump -U insta insta_like_player > ilp-dump.sql

# copy ilp-dump.sql to the new Mac, then on the NEW Mac (after `npm run db:up`):
cat ilp-dump.sql | docker exec -i insta_like_player_db psql -U insta -d insta_like_player
```

Alternatively, skip migration and just re-run `npm run ingest` + `npm run sync`
on the new Mac with a fresh export (simplest, but re-downloads everything).

> Tip: also copy `data/cookies.txt` if you'll download on the new Mac.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `http://localhost:7319` not responding | `tail -f data/logs/app.err.log`; ensure `npm run build` ran; reinstall service |
| App up but no videos play | Database/media missing — check `npm run db:up` and that `data/media` has files |
| Can't reach it from phone | Confirm both devices show in `tailscale status`; re-run `tailscale serve --bg 7319` |
| DB connection errors on boot | Docker wasn't up yet — launchd retries; or enable Docker "start on sign in" |
| Port 7319 conflict | Change `-p 7319` in the `serve` script in `package.json`, rebuild, reinstall service, re-run `tailscale serve` with the new port |
