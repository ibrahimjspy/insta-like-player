# Security Policy

Like Player is a **single-user, self-hosted** app that runs on your own machine
and works with your own exported data. Even so, security reports are welcome and
appreciated.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, use GitHub's private reporting:
**[Open a security advisory](https://github.com/ibrahimjspy/insta-like-player/security/advisories/new)**
(repo → **Security** → **Report a vulnerability**).

Include where possible:

- A description of the issue and its impact
- Steps to reproduce (or a proof of concept)
- Affected version / commit
- Any suggested fix

I'll aim to acknowledge reports within a few days and keep you updated on a fix.

## In scope

Because this is a local, single-user app, the most relevant classes of issue are:

- **Path traversal** in the media-streaming route (`/api/media/...`)
- **Credential or session leakage** — e.g. cookies, `DATABASE_URL`, or absolute
  file paths exposed to the browser or committed to git
- **SSRF / command injection** around the `yt-dlp` invocation
- **Exposure when self-hosted** — e.g. the admin endpoints being reachable
  without intending to expose them

## Out of scope

- Issues that require an attacker to already have local shell access to the host
- Risks inherent to running `yt-dlp` against third-party platforms
- Account/ToS risk from downloading your own liked media (documented in the README)

## Good hygiene for operators

- Keep `data/` (media, exports, `cookies*.txt`) out of git — it's gitignored by default.
- Don't expose the app to the public internet; prefer a private network (e.g. Tailscale).
- Treat `cookies*.txt` like a password — it's a live session credential.
