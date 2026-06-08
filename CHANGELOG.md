# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Multi-platform ingest: **TikTok** (`user_data_tiktok.json`) and **Facebook**
  (reactions, saves, and `collections.json`) alongside Instagram.
- Platform filters and creator chips in **Search**.
- **For you** feed — personalized ranking from watch behavior (watch time, loops,
  deep watches vs quick skips, creator/hashtag/collection affinity).
- Per-platform yt-dlp cookies and browser impersonation config.
- Public project docs: README with demo + screenshots, `CONTRIBUTING.md`,
  `SECURITY.md`, deployment guide, issue/PR templates, and CI.

### Changed

- Media storage key is now `<platform>_<id>` for non-Instagram sources
  (Instagram keeps bare shortcodes for backward compatibility).
- Media streaming route is keyed by platform + shortcode
  (`/api/media/<type>/<platform>/<shortcode>`).

## [0.1.0]

### Added

- Initial Instagram-only release: ingest `liked_posts.json`, download media via
  `yt-dlp`, and browse a vertical feed with search, favorites, and collections.
- Admin dashboard for import, sync monitoring, and reel management.
- Self-hosting via a `launchd` service on port 7319 + Tailscale.

[Unreleased]: https://github.com/ibrahimjspy/insta-like-player/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ibrahimjspy/insta-like-player/releases/tag/v0.1.0
