import { beforeEach, describe, expect, it, vi } from "vitest";

const engagementCount = vi.fn();
const engagementFindUnique = vi.fn();
const engagementUpsert = vi.fn();
const historyCreate = vi.fn();
const executeRaw = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    reelEngagement: {
      count: (...args: unknown[]) => engagementCount(...args),
      findUnique: (...args: unknown[]) => engagementFindUnique(...args),
      upsert: (...args: unknown[]) => engagementUpsert(...args),
    },
    watchHistory: { create: (...args: unknown[]) => historyCreate(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args),
  },
}));

import {
  addWatchTime,
  backfillEngagementFromHistory,
  clampWatchSec,
  MAX_WATCH_SEC_PER_FLUSH,
  MIN_WATCH_SEC_TO_RECORD,
  recordWatchSession,
} from "@/lib/feed/engagement";

beforeEach(() => {
  engagementCount.mockReset();
  engagementFindUnique.mockReset();
  engagementUpsert.mockReset();
  historyCreate.mockReset();
  executeRaw.mockReset();
  transaction.mockReset();
  transaction.mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  engagementFindUnique.mockResolvedValue({ maxPositionSec: 0 });
  engagementUpsert.mockResolvedValue({});
  historyCreate.mockResolvedValue({});
  executeRaw.mockResolvedValue(1);
});

describe("clampWatchSec", () => {
  it("drops sub-threshold and non-finite values", () => {
    expect(clampWatchSec(0)).toBe(0);
    expect(clampWatchSec(MIN_WATCH_SEC_TO_RECORD - 1)).toBe(0);
    expect(clampWatchSec(Number.NaN)).toBe(0);
  });

  it("rounds and caps large flushes", () => {
    expect(clampWatchSec(2.4)).toBe(2);
    expect(clampWatchSec(MAX_WATCH_SEC_PER_FLUSH + 100)).toBe(MAX_WATCH_SEC_PER_FLUSH);
  });
});

describe("backfillEngagementFromHistory", () => {
  it("skips when engagement rows already exist", async () => {
    engagementCount.mockResolvedValue(5);
    await backfillEngagementFromHistory();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("runs backfill SQL when table is empty", async () => {
    engagementCount.mockResolvedValue(0);
    await backfillEngagementFromHistory();
    expect(executeRaw).toHaveBeenCalled();
  });
});

describe("recordWatchSession", () => {
  it("creates history and upserts engagement", async () => {
    await recordWatchSession("reel-1", 12);
    expect(transaction).toHaveBeenCalled();
    expect(historyCreate).toHaveBeenCalled();
    expect(engagementUpsert).toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalled();
  });
});

describe("addWatchTime", () => {
  it("still records quick skip when watch seconds are below persistence threshold", async () => {
    await addWatchTime("reel-1", 1, 0, { durationSec: 60 });
    expect(engagementUpsert).toHaveBeenCalled();
    const update = engagementUpsert.mock.calls[0][0].update;
    expect(update.quickSkipCount).toEqual({ increment: 1 });
    expect(update.totalWatchSec).toBeUndefined();
  });

  it("increments watch seconds", async () => {
    await addWatchTime("reel-1", 10, 30, { durationSec: 60 });
    expect(engagementUpsert).toHaveBeenCalled();
    const update = engagementUpsert.mock.calls[0][0].update;
    expect(update.totalWatchSec).toEqual({ increment: 10 });
  });

  it("increments loopCount when provided", async () => {
    await addWatchTime("reel-1", 5, 0, { durationSec: 60, loopCount: 2 });
    const update = engagementUpsert.mock.calls[0][0].update;
    expect(update.loopCount).toEqual({ increment: 2 });
  });

  it("increments deepWatchCount on high completion", async () => {
    await addWatchTime("reel-1", 70, 75, { durationSec: 80 });
    const update = engagementUpsert.mock.calls[0][0].update;
    expect(update.deepWatchCount).toEqual({ increment: 1 });
  });

  it("increments quickSkipCount on bounce", async () => {
    await addWatchTime("reel-1", 2, 1, { durationSec: 120 });
    const update = engagementUpsert.mock.calls[0][0].update;
    expect(update.quickSkipCount).toEqual({ increment: 1 });
  });
});
