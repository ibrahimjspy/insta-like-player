import { describe, expect, it } from "vitest";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  classifyWatchSession,
  completionRatio,
  decayMultiplier,
  durationBucket,
  reelDecayedEngagement,
} from "@/lib/feed/taste";

describe("decayMultiplier", () => {
  it("is 1 at age zero", () => {
    expect(decayMultiplier(0)).toBe(1);
  });

  it("halves at configured half-life", () => {
    const half = FEED_TASTE_CONFIG.decayHalfLifeDays;
    expect(decayMultiplier(half)).toBeCloseTo(0.5, 2);
  });

  it("decays further over time", () => {
    expect(decayMultiplier(42)).toBeLessThan(decayMultiplier(7));
  });
});

describe("completionRatio", () => {
  it("uses max of position and watch progress", () => {
    expect(completionRatio(10, 50, 100)).toBe(0.5);
    expect(completionRatio(80, 10, 100)).toBe(0.8);
  });

  it("handles unknown duration with a soft cap", () => {
    expect(completionRatio(15, 0, null)).toBe(0.5);
    expect(completionRatio(35, 0, null)).toBe(1);
  });
});

describe("durationBucket", () => {
  it("uses config boundaries", () => {
    const { shortMaxSec, mediumMaxSec } = FEED_TASTE_CONFIG.duration;
    expect(durationBucket(shortMaxSec - 1)).toBe("short");
    expect(durationBucket(shortMaxSec)).toBe("medium");
    expect(durationBucket(mediumMaxSec - 1)).toBe("medium");
    expect(durationBucket(mediumMaxSec)).toBe("long");
  });
});

describe("classifyWatchSession", () => {
  it("marks a full loop as deep watch", () => {
    expect(
      classifyWatchSession({
        watchSec: 5,
        positionSec: 2,
        durationSec: 60,
        loopCount: 1,
      }).deepWatch,
    ).toBe(true);
    expect(
      classifyWatchSession({
        watchSec: 5,
        positionSec: 2,
        durationSec: 60,
        loopCount: 1,
      }).quickSkip,
    ).toBe(false);
  });

  it("marks a bounce as quick skip", () => {
    const r = classifyWatchSession({
      watchSec: 3,
      positionSec: 1,
      durationSec: 90,
    });
    expect(r.quickSkip).toBe(true);
    expect(r.deepWatch).toBe(false);
  });

  it("marks high completion as deep watch", () => {
    expect(
      classifyWatchSession({
        watchSec: 40,
        positionSec: 75,
        durationSec: 80,
      }).deepWatch,
    ).toBe(true);
  });

  it("does not mark mid watch as quick skip or deep", () => {
    const r = classifyWatchSession({
      watchSec: 25,
      positionSec: 30,
      durationSec: 90,
    });
    expect(r.quickSkip).toBe(false);
    expect(r.deepWatch).toBe(false);
  });
});

describe("reelDecayedEngagement", () => {
  it("rewards deep watches and loops in raw score", () => {
    const shallow = reelDecayedEngagement({
      totalWatchSec: 10,
      watchCount: 1,
      deepWatchCount: 0,
      loopCount: 0,
      quickSkipCount: 0,
      ageDays: 0,
    });
    const deep = reelDecayedEngagement({
      totalWatchSec: 10,
      watchCount: 1,
      deepWatchCount: 3,
      loopCount: 2,
      quickSkipCount: 0,
      ageDays: 0,
    });
    expect(deep).toBeGreaterThan(shallow);
  });

  it("penalizes quick skips in raw score", () => {
    const clean = reelDecayedEngagement({
      totalWatchSec: 30,
      watchCount: 1,
      deepWatchCount: 0,
      loopCount: 0,
      quickSkipCount: 0,
      ageDays: 0,
    });
    const skipped = reelDecayedEngagement({
      totalWatchSec: 30,
      watchCount: 1,
      deepWatchCount: 0,
      loopCount: 0,
      quickSkipCount: 3,
      ageDays: 0,
    });
    expect(clean).toBeGreaterThan(skipped);
  });

  it("decays with age", () => {
    const fresh = reelDecayedEngagement({
      totalWatchSec: 60,
      watchCount: 2,
      deepWatchCount: 2,
      loopCount: 1,
      quickSkipCount: 0,
      ageDays: 0,
    });
    const stale = reelDecayedEngagement({
      totalWatchSec: 60,
      watchCount: 2,
      deepWatchCount: 2,
      loopCount: 1,
      quickSkipCount: 0,
      ageDays: 42,
    });
    expect(fresh).toBeGreaterThan(stale);
  });
});
