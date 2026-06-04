# For you feed module (`src/lib/feed`)

Personalized reel ranking for `?order=random` (UI label: **For you**).

| File | Role |
|------|------|
| [`config.ts`](./config.ts) | **Edit here** — weights, thresholds, half-life |
| [`taste.ts`](./taste.ts) | Pure session classification + decay math (unit tested) |
| [`sql.ts`](./sql.ts) | Builds the scoring SQL from `config` |
| [`smart-feed.ts`](./smart-feed.ts) | `smartFeedIdsQuery()`, session exclude list |
| [`engagement.ts`](./engagement.ts) | DB writes: `ReelEngagement`, `WatchHistory` |
| [`index.ts`](./index.ts) | Public exports |

Full design: [docs/FEED_RECOMMENDATIONS.md](../../../docs/FEED_RECOMMENDATIONS.md).

After changing `config.ts`, run `npm test -- src/lib/feed`.
