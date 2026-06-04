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

export const MIN_WATCH_SEC_TO_RECORD = FEED_TASTE_CONFIG.session.minWatchSecToRecord;
export const MAX_WATCH_SEC_PER_FLUSH = FEED_TASTE_CONFIG.session.maxWatchSecPerFlush;

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
      (COUNT(*) * 22)::int,
      LEAST(COUNT(*)::int, 3),
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

/** Merges a playback segment into the rollup (time, loops, deep/skip quality). */
export async function addWatchTime(
  reelId: string,
  watchSec: number,
  positionSec = 0,
  metrics: Omit<WatchFlushMetrics, "watchSec" | "positionSec"> = {},
): Promise<void> {
  const sec = clampWatchSec(watchSec);
  const pos = Math.max(0, Math.round(positionSec));
  const loops = Math.max(0, Math.round(metrics.loopCount ?? 0));

  const { deepWatch, quickSkip } = classifyWatchSession({
    watchSec: sec || watchSec,
    positionSec: pos,
    durationSec: metrics.durationSec,
    loopCount: loops,
  });

  if (sec === 0 && loops === 0 && !deepWatch && !quickSkip) return;

  const existing = await prisma.reelEngagement.findUnique({
    where: { reelId },
    select: { maxPositionSec: true },
  });

  await prisma.reelEngagement.upsert({
    where: { reelId },
    create: {
      reelId,
      watchCount: 0,
      totalWatchSec: sec,
      maxPositionSec: pos,
      loopCount: loops,
      deepWatchCount: deepWatch ? 1 : 0,
      quickSkipCount: quickSkip ? 1 : 0,
      lastWatchedAt: new Date(),
    },
    update: {
      ...(sec > 0 ? { totalWatchSec: { increment: sec } } : {}),
      ...(loops > 0 ? { loopCount: { increment: loops } } : {}),
      ...(deepWatch ? { deepWatchCount: { increment: 1 } } : {}),
      ...(quickSkip ? { quickSkipCount: { increment: 1 } } : {}),
      lastWatchedAt: new Date(),
      maxPositionSec: Math.max(existing?.maxPositionSec ?? 0, pos),
    },
  });
}
