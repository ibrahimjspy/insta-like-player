/**
 * Pure taste helpers for engagement rollups and documentation.
 * No database or I/O — safe to unit test without mocks.
 */

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

export type WatchFlushMetrics = {
  watchSec: number;
  positionSec: number;
  durationSec?: number | null;
  loopCount?: number;
};

export type DurationBucket = "short" | "medium" | "long";

/** Exponential decay: full weight at 0 days, ~50% at `halfLifeDays`. */
export function decayMultiplier(
  ageDays: number,
  halfLifeDays = FEED_TASTE_CONFIG.decayHalfLifeDays,
): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return Math.exp((-ageDays * Math.LN2) / halfLifeDays);
}

/** Best estimate of how much of the reel was consumed (0–1). */
export function completionRatio(
  watchSec: number,
  positionSec: number,
  durationSec?: number | null,
): number {
  const dur = durationSec ?? 0;
  const { unknownDurationDeepSec } = FEED_TASTE_CONFIG.classify;
  if (dur <= 0) {
    return watchSec >= unknownDurationDeepSec ? 1 : watchSec / unknownDurationDeepSec;
  }
  return Math.min(1, Math.max(positionSec / dur, watchSec / dur));
}

/** Maps reel length to a taste bucket (used in SQL and tests). */
export function durationBucket(durationSec?: number | null): DurationBucket {
  const { defaultSec, shortMaxSec, mediumMaxSec } = FEED_TASTE_CONFIG.duration;
  const d = durationSec ?? defaultSec;
  if (d < shortMaxSec) return "short";
  if (d < mediumMaxSec) return "medium";
  return "long";
}

/**
 * Classifies one playback segment when flushing watch time.
 * Increments `deepWatchCount` / `quickSkipCount` on the rollup row.
 */
export function classifyWatchSession(metrics: WatchFlushMetrics): {
  deepWatch: boolean;
  quickSkip: boolean;
} {
  const c = FEED_TASTE_CONFIG.classify;
  const watchSec = Math.max(0, metrics.watchSec);
  const loops = metrics.loopCount ?? 0;
  const completion = completionRatio(
    watchSec,
    metrics.positionSec,
    metrics.durationSec,
  );

  const deepWatch =
    loops >= 1 ||
    completion >= c.deepCompletionMin ||
    (watchSec >= c.deepLongWatchSec && completion >= c.deepLongCompletionMin);

  const quickSkip =
    !deepWatch &&
    (watchSec < c.quickSkipMaxSec ||
      (watchSec < c.quickSkipMidMaxSec && completion < c.quickSkipMidCompletionMax) ||
      (watchSec < c.quickSkipLongMaxSec && completion < c.quickSkipLongCompletionMax));

  return { deepWatch, quickSkip };
}

/**
 * TypeScript mirror of SQL `decayed_eng` in the `eng` CTE.
 * Use tests to keep this aligned when editing `engagementRaw` weights.
 */
export function reelDecayedEngagement(input: {
  totalWatchSec: number;
  watchCount: number;
  deepWatchCount: number;
  loopCount: number;
  quickSkipCount: number;
  ageDays: number;
}): number {
  const r = FEED_TASTE_CONFIG.engagementRaw;
  const raw =
    input.totalWatchSec +
    input.watchCount * r.perWatchCount +
    input.deepWatchCount * r.perDeepWatch +
    input.loopCount * r.perLoop +
    input.quickSkipCount * r.perQuickSkip;
  return Math.max(0, raw) * decayMultiplier(input.ageDays);
}
