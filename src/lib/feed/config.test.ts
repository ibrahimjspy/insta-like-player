import { describe, expect, it } from "vitest";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

describe("FEED_TASTE_CONFIG", () => {
  it("keeps engagement penalties negative in raw rollup", () => {
    expect(FEED_TASTE_CONFIG.engagementRaw.perQuickSkip).toBeLessThan(0);
  });

  it("keeps score weights non-negative except penalties stored as positive magnitudes", () => {
    const w = FEED_TASTE_CONFIG.scoreWeights;
    expect(w.unseenBoost).toBeGreaterThan(0);
    expect(w.creatorAffinity).toBeGreaterThan(0);
    expect(w.quickSkipPenalty).toBeGreaterThan(0);
  });

  it("keeps ratio thresholds between 0 and 1 where applicable", () => {
    const t = FEED_TASTE_CONFIG.thresholds;
    expect(t.lovedCreatorMinRatio).toBeGreaterThan(0);
    expect(t.lovedCreatorMinRatio).toBeLessThanOrEqual(1);
    expect(t.strongTagMinRatio).toBeGreaterThan(0);
    expect(t.strongTagMinRatio).toBeLessThanOrEqual(1);
  });

  it("aligns session limits with engagement exports", () => {
    expect(FEED_TASTE_CONFIG.session.minWatchSecToRecord).toBe(2);
    expect(FEED_TASTE_CONFIG.exclude.maxSessionIds).toBe(48);
  });
});
