/**
 * Writes watch engagement to `ReelEngagement` + `WatchHistory`.
 * Called from server actions when the feed player starts or ends a segment.
 */

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  classifyWatchSession,
  type WatchFlushMetrics,
} from "@/lib/feed/taste";
import { prisma } from "@/lib/db";

export type { WatchFlushMetrics };

export type EngagementFlushMetrics = Omit<WatchFlushMetrics, "watchSec" | "positionSec"> & {
  /**
   * Checkpoint flushes persist watch seconds for crash resilience but should not
   * increment deep/skip counters until the session ends.
   */
  classify?: boolean;
  classificationWatchSec?: number;
  classificationPositionSec?: number;
  classificationLoopCount?: number;
};

export const MIN_WATCH_SEC_TO_RECORD = FEED_TASTE_CONFIG.session.minWatchSecToRecord;
export const MAX_WATCH_SEC_PER_FLUSH = FEED_TASTE_CONFIG.session.maxWatchSecPerFlush;

const { backfill: BACKFILL } = FEED_TASTE_CONFIG;

export function clampWatchSec(sec: number): number {
  if (!Number.isFinite(sec) || sec < MIN_WATCH_SEC_TO_RECORD) return 0;
  return Math.min(Math.round(sec), MAX_WATCH_SEC_PER_FLUSH);
}

/**
 * One-time import from legacy `WatchHistory` when `ReelEngagement` is empty.
 * Safe to call on every For you request (no-op after first row exists).
 */
export async function backfillEngagementFromHistory(): Promise<void> {
  const existing = await prisma.reelEngagement.count();
  if (existing > 0) return;

  await prisma.$executeRaw`
    INSERT INTO "ReelEngagement" (
      "reelId",
      "watchCount",
      "totalWatchSec",
      "deepWatchCount",
      "lastWatchedAt"
    )
    SELECT
      "reelId",
      COUNT(*)::int,
      (COUNT(*) * ${BACKFILL.assumedWatchSecPerSession})::int,
      LEAST(COUNT(*)::int, ${BACKFILL.maxDeepWatchFromSessions}),
      MAX("watchedAt")
    FROM "WatchHistory"
    GROUP BY "reelId"
    ON CONFLICT ("reelId") DO NOTHING
  `;
}

/** Starts a watch session: append history + increment `watchCount`. */
export async function recordWatchSession(reelId: string, positionSec = 0): Promise<void> {
  const pos = Math.max(0, Math.round(positionSec));
  await prisma.$transaction([
    prisma.watchHistory.create({ data: { reelId, positionSec: pos } }),
    prisma.reelEngagement.upsert({
      where: { reelId },
      create: {
        reelId,
        watchCount: 1,
        totalWatchSec: 0,
        maxPositionSec: pos,
        lastWatchedAt: new Date(),
      },
      update: {
        watchCount: { increment: 1 },
        lastWatchedAt: new Date(),
      },
    }),
  ]);
  await prisma.$executeRaw`
    UPDATE "ReelEngagement"
    SET "maxPositionSec" = GREATEST("maxPositionSec", ${pos})
    WHERE "reelId" = ${reelId}
  `;
}

/**
 * Merges a playback segment into the rollup using a single upsert (atomic increments).
 */
export async function addWatchTime(
  reelId: string,
  watchSec: number,
  positionSec = 0,
  metrics: EngagementFlushMetrics = {},
): Promise<void> {
  const sec = clampWatchSec(watchSec);
  const pos = Math.max(0, Math.round(positionSec));
  const loops = Math.max(0, Math.round(metrics.loopCount ?? 0));

  const shouldClassify = metrics.classify ?? true;
  const classificationWatchSec = metrics.classificationWatchSec ?? (sec || watchSec);
  const classificationPositionSec = metrics.classificationPositionSec ?? pos;
  const classificationLoopCount = metrics.classificationLoopCount ?? loops;

  const { deepWatch, quickSkip } = shouldClassify
    ? classifyWatchSession({
        watchSec: classificationWatchSec,
        positionSec: classificationPositionSec,
        durationSec: metrics.durationSec,
        loopCount: classificationLoopCount,
      })
    : { deepWatch: false, quickSkip: false };

  if (sec === 0 && loops === 0 && !deepWatch && !quickSkip) return;

  const deepInc = deepWatch ? 1 : 0;
  const skipInc = quickSkip ? 1 : 0;

  await prisma.$executeRaw`
    INSERT INTO "ReelEngagement" (
      "reelId",
      "watchCount",
      "totalWatchSec",
      "maxPositionSec",
      "loopCount",
      "deepWatchCount",
      "quickSkipCount",
      "lastWatchedAt"
    )
    VALUES (
      ${reelId},
      0,
      ${sec},
      ${pos},
      ${loops},
      ${deepInc},
      ${skipInc},
      NOW()
    )
    ON CONFLICT ("reelId") DO UPDATE SET
      "totalWatchSec" = "ReelEngagement"."totalWatchSec" + ${sec},
      "maxPositionSec" = GREATEST("ReelEngagement"."maxPositionSec", ${pos}),
      "loopCount" = "ReelEngagement"."loopCount" + ${loops},
      "deepWatchCount" = "ReelEngagement"."deepWatchCount" + ${deepInc},
      "quickSkipCount" = "ReelEngagement"."quickSkipCount" + ${skipInc},
      "lastWatchedAt" = NOW()
  `;
}
