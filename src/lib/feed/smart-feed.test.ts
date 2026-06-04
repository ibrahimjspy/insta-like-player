import { describe, expect, it } from "vitest";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import { sqlQueryText } from "@/lib/feed/sql";
import { normalizeExcludeIds, smartFeedIdsQuery } from "@/lib/feed/smart-feed";

describe("normalizeExcludeIds", () => {
  it("returns empty for undefined or empty input", () => {
    expect(normalizeExcludeIds(undefined)).toEqual([]);
    expect(normalizeExcludeIds([])).toEqual([]);
  });

  it("dedupes while preserving order", () => {
    expect(normalizeExcludeIds(["b", "a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("drops empty strings", () => {
    expect(normalizeExcludeIds(["", "x", ""])).toEqual(["x"]);
  });

  it("caps at configured max", () => {
    const max = FEED_TASTE_CONFIG.exclude.maxSessionIds;
    const ids = Array.from({ length: max + 10 }, (_, i) => `id-${i}`);
    expect(normalizeExcludeIds(ids)).toHaveLength(max);
  });
});

describe("smartFeedIdsQuery", () => {
  it("builds a full personalized query", () => {
    const sql = sqlQueryText(smartFeedIdsQuery(10, ["x", "y"]));
    expect(sql).toContain("ReelEngagement");
    expect(sql).toContain("collection_scores");
    expect(sql).toContain("duration_taste");
    expect(sql).toContain("loved_creators");
    expect(sql).toContain("NOT IN");
    expect(sql).toContain("LIMIT ");
  });
});
