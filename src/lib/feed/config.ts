/**
 * Central tuning for the **For you** feed (`?order=random` in the UI).
 *
 * ## How to modify behavior
 * 1. Change numbers in this file only (weights, thresholds, half-life).
 * 2. Run `npm test` — `config.test.ts` and `sql.test.ts` assert SQL stays aligned.
 * 3. Pure session rules live in `taste.ts`; aggregation SQL in `sql.ts`.
 *
 * See [docs/FEED_RECOMMENDATIONS.md](../../../docs/FEED_RECOMMENDATIONS.md) for the full design.
 */
export const FEED_TASTE_CONFIG = {
  /** Exponential half-life for engagement decay (days). */
  decayHalfLifeDays: 21,

  /** Default assumed duration when `Reel.durationSec` is null. */
  duration: {
    defaultSec: 45,
    shortMaxSec: 30,
    mediumMaxSec: 90,
  },

  /** Playback flush limits (client → `addWatchTime`). */
  session: {
    minWatchSecToRecord: 2,
    maxWatchSecPerFlush: 600,
    /** Client checkpoints long watches every N ms. */
    checkpointIntervalMs: 30_000,
    checkpointMinSec: 12,
  },

  /** Raw engagement before time decay (mirrored in SQL `eng` CTE). */
  engagementRaw: {
    perWatchCount: 12,
    perDeepWatch: 28,
    perLoop: 20,
    perQuickSkip: -22,
  },

  /** Multipliers applied in the final candidate score. */
  scoreWeights: {
    unseenBoost: 2.35,
    watchDepth: 0.55,
    peakCompletion: 0.35,
    deepWatchCount: 0.22,
    deepWatchCountCap: 1.4,
    loopCount: 0.18,
    loopCountCap: 1.2,
    creatorAffinity: 1.45,
    tagSum: 0.95,
    strongTagHit: 0.28,
    strongTagHitCap: 1.1,
    collectionAffinity: 0.75,
    durationTaste: 1,
    durationTasteMedium: 1.05,
    durationTasteLong: 1.1,
    favorite: 0.65,
    lovedCreatorUnseen: 1.15,
    tagDiscoveryUnseen: 0.95,
    likedAtRecencyUnseen: 0.2,
    quickSkipPenalty: 1.35,
    overexposedPenalty: 1.0,
    recent3hPenalty: 1.55,
    recent24hRepeatPenalty: 0.45,
  },

  /** Ratio / count gates used in SQL CASE expressions. */
  thresholds: {
    lovedCreatorMinRatio: 0.32,
    strongTagMinRatio: 0.22,
    strongTagHitsForDiscovery: 2,
    minCandidateScore: 0.05,
    watchDepthCap: 4,
    quickSkipCountMin: 2,
    peakCompletionSkipMax: 0.1,
    watchCountSkipMin: 2,
    overexposedWatchCount: 7,
    overexposedTotalSec: 240,
    likedAtRecencyDays: 120,
    recent3hHours: 3,
    recent24hHours: 24,
    recent24hWatchCount: 2,
  },

  /** Session classification (`classifyWatchSession` in taste.ts). */
  classify: {
    deepCompletionMin: 0.82,
    deepLongWatchSec: 50,
    deepLongCompletionMin: 0.55,
    quickSkipMaxSec: 4,
    quickSkipMidMaxSec: 10,
    quickSkipMidCompletionMax: 0.12,
    quickSkipLongMaxSec: 18,
    quickSkipLongCompletionMax: 0.06,
    unknownDurationDeepSec: 30,
  },

  /** Infinite scroll: exclude recently shown reel ids from the next batch. */
  exclude: {
    maxSessionIds: 48,
  },
} as const;

export type FeedTasteConfig = typeof FEED_TASTE_CONFIG;
