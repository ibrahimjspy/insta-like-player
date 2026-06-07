import { beforeEach, describe, expect, it, vi } from "vitest";

const engagementCount = vi.fn();
const engagementUpsert = vi.fn();
const historyCreate = vi.fn();
const executeRaw = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    reelEngagement: {
      count: (...args: unknown[]) => engagementCount(...args),
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
  engagementUpsert.mockReset();
  historyCreate.mockReset();
  executeRaw.mockReset();
  transaction.mockReset();
  transaction.mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
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
  const rawValues = () => executeRaw.mock.calls[0].slice(1);

  it("no-ops when nothing to persist", async () => {
    await addWatchTime("reel-1", 0, 0, {});
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("still records quick skip when watch seconds are below persistence threshold", async () => {
    await addWatchTime("reel-1", 1, 0, { durationSec: 60 });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("upserts watch seconds and position atomically", async () => {
    await addWatchTime("reel-1", 10, 30, { durationSec: 60 });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("persists loopCount in the upsert", async () => {
    await addWatchTime("reel-1", 5, 0, { durationSec: 60, loopCount: 2 });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("persists deep watch classification", async () => {
    await addWatchTime("reel-1", 70, 75, { durationSec: 80 });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("persists quick skip on bounce", async () => {
    await addWatchTime("reel-1", 2, 1, { durationSec: 120 });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("persists checkpoint watch time without classifying the session", async () => {
    await addWatchTime("reel-1", 30, 30, {
      durationSec: 60,
      classify: false,
    });

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const values = rawValues();
    expect(values[4]).toBe(0); // deepWatchCount increment
    expect(values[5]).toBe(0); // quickSkipCount increment
  });

  it("classifies final flush from full-session totals instead of latest checkpoint", async () => {
    await addWatchTime("reel-1", 1, 50, {
      durationSec: 60,
      classify: true,
      classificationWatchSec: 55,
      classificationPositionSec: 50,
      classificationLoopCount: 0,
    });

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const values = rawValues();
    expect(values[1]).toBe(0); // latest segment is below watch-second persistence threshold
    expect(values[4]).toBe(1); // full session is still a deep watch
    expect(values[5]).toBe(0);
  });
});
