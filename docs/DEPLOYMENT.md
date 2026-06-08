# Self-hosting guide

Run Like Player as an always-on personal server and access it from your phone
and other devices over a private [Tailscale](https://tailscale.com) network —
no cloud hosting, no public exposure, no recurring cost.

The sync worker needs `yt-dlp`, a real disk, and optional browser cookies.
Serverless platforms (Vercel, etc.) cannot run this stack.

> Default app port: **7319** (avoids common dev-server collisions).

---

## Prerequisites

```bash
brew install node yt-dlp ffmpeg   # macOS; adapt for Linux
# Docker Desktop — for PostgreSQL
# Tailscale — for private remote access
```

Enable **Start Docker Desktop when you sign in** so the database survives reboots.

---

## Install

```bash
git clone https://github.com/ibrahimjspy/insta-like-player.git
cd insta-like-player
npm install
cp .env.example .env
```

Edit `.env` if needed:

- **`DATABASE_URL`** — if port 5432 is already in use, change the port here and
  `POSTGRES_PORT` to match.
- **`YTDLP_COOKIES_*`** — set per platform you plan to download from (see README).
- **`SYNC_RATE_LIMIT_MS`** — delay between downloads (`6000` is conservative).

```bash
npm run db:up && npm run db:push
npm run ingest -- path/to/export.json    # repeat per platform as needed
npm run sync
```

---

## Always-on service (macOS)

```bash
npm run build
bash scripts/install-service.sh
```

This registers a `launchd` agent that:

- serves on **port 7319** (all interfaces),
- auto-starts on login and restarts on crash,
- logs to `data/logs/app.log`.

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7319/   # expect 200
```

Manage:

```bash
bash scripts/install-service.sh      # reinstall / restart
bash scripts/uninstall-service.sh  # remove
tail -f data/logs/app.log
```

On Linux, run `npm run serve` under systemd or your preferred process manager
instead of the launchd scripts.

---

## Tailscale access

1. Install Tailscale on the server Mac and on your phone — same account.
2. In the [admin console](https://login.tailscale.com/admin/dns): enable **MagicDNS** and **HTTPS**.
3. On the server:

   ```bash
   tailscale serve --bg 7319
   ```

4. Open `https://<machine-name>.<tailnet>.ts.net` from any device on your tailnet.
   On iOS: Share → Add to Home Screen for an app-like icon.

Stop serving: `tailscale serve reset`.

---

## Moving your library to another machine

Library data is **not** in git (`data/` is gitignored). To migrate:

**Media:**

```bash
rsync -av source-host:path/to/like-player/data/media/ data/media/
```

**Database** (after `npm run db:up` on the new machine):

```bash
# on source
docker exec insta_like_player_db pg_dump -U insta insta_like_player > dump.sql

# on destination
cat dump.sql | docker exec -i insta_like_player_db psql -U insta -d insta_like_player
```

Or re-run `npm run ingest` + `npm run sync` with fresh exports (re-downloads everything).

Copy `data/cookies*.txt` if you will sync on the new machine.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `localhost:7319` not responding | Check `data/logs/app.err.log`; run `npm run build`; reinstall service |
| Videos won't play | Confirm `npm run db:up` and files exist under `data/media/` |
| Phone can't reach server | Both devices on same tailnet? Re-run `tailscale serve --bg 7319` |
| DB errors on boot | Docker not ready yet — enable Docker auto-start; launchd retries |
| Port conflict | Change port in `package.json` `serve` script, rebuild, update Tailscale serve |

---

## Keeping the server awake

The macOS service uses `caffeinate` to prevent idle sleep. Closing the laptop lid
still sleeps unless on power with an external display. For a dedicated box, keep
it plugged in or adjust `pmset` sleep settings.
