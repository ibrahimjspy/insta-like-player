/**
 * For you feed: engagement tracking + personalized reel selection.
 *
 * @see docs/FEED_RECOMMENDATIONS.md
 * @see src/lib/feed/config.ts — tune weights and thresholds
 */

export { FEED_TASTE_CONFIG, type FeedTasteConfig } from "@/lib/feed/config";
export {
  addWatchTime,
  backfillEngagementFromHistory,
  clampWatchSec,
  MAX_WATCH_SEC_PER_FLUSH,
  MIN_WATCH_SEC_TO_RECORD,
  recordWatchSession,
  type WatchFlushMetrics,
} from "@/lib/feed/engagement";
export {
  buildSmartFeedIdsSql,
  sqlDurationBucketCase,
  sqlFloat,
  sqlQueryText,
} from "@/lib/feed/sql";
export { normalizeExcludeIds, smartFeedIdsQuery } from "@/lib/feed/smart-feed";
export {
  buildFeedFetchUrl,
  nextFeedPaginationState,
  shouldLoadMoreFeed,
  trackRecentReelId,
  withFeedKeys,
  type FeedItem,
} from "@/lib/feed/feed-pagination";
export {
  classifyWatchSession,
  completionRatio,
  decayMultiplier,
  durationBucket,
  reelDecayedEngagement,
  type DurationBucket,
} from "@/lib/feed/taste";
