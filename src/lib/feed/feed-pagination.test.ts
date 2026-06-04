import { describe, expect, it } from "vitest";

import {
  buildFeedFetchUrl,
  nextFeedPaginationState,
  shouldLoadMoreFeed,
  trackRecentReelId,
  withFeedKeys,
} from "@/lib/feed/feed-pagination";

describe("withFeedKeys", () => {
  it("appends offset to disambiguate duplicate reel ids", () => {
    const items = withFeedKeys(
      [
        { id: "a", shortcode: "x" } as never,
        { id: "a", shortcode: "x" } as never,
      ],
      10,
    );
    expect(items.map((i) => i.feedKey)).toEqual(["a-10", "a-11"]);
  });
});

describe("shouldLoadMoreFeed", () => {
  it("stops random mode when exhausted", () => {
    expect(
      shouldLoadMoreFeed({
        paginate: true,
        order: "random",
        cursor: "more",
        randomExhausted: true,
      }),
    ).toBe(false);
  });

  it("continues recent mode while cursor exists", () => {
    expect(
      shouldLoadMoreFeed({
        paginate: true,
        order: "recent",
        cursor: "abc",
        randomExhausted: false,
      }),
    ).toBe(true);
  });
});

describe("nextFeedPaginationState", () => {
  it("marks random exhausted on empty batch", () => {
    expect(
      nextFeedPaginationState({
        order: "random",
        cursor: null,
        randomExhausted: false,
        page: { items: [], nextCursor: null },
      }),
    ).toEqual({ cursor: null, randomExhausted: true });
  });

  it("advances cursor for recent/oldest", () => {
    expect(
      nextFeedPaginationState({
        order: "recent",
        cursor: "a",
        randomExhausted: false,
        page: { items: [{ id: "b" } as never], nextCursor: "b" },
      }),
    ).toEqual({ cursor: "b", randomExhausted: false });
  });
});

describe("trackRecentReelId", () => {
  it("appends new ids and dedupes", () => {
    expect(trackRecentReelId(["a", "b"], "c", 3)).toEqual(["a", "b", "c"]);
    expect(trackRecentReelId(["a", "b", "c"], "b", 3)).toEqual(["a", "c", "b"]);
  });

  it("no-ops when the same id is already last", () => {
    const prev = ["a", "b"];
    expect(trackRecentReelId(prev, "b")).toEqual(["a", "b"]);
    expect(trackRecentReelId(prev, "b")).not.toBe(prev);
  });
});

describe("buildFeedFetchUrl", () => {
  it("includes exclude list for random", () => {
    const url = buildFeedFetchUrl({
      order: "random",
      cursor: null,
      excludeReelIds: ["id1", "id2"],
    });
    expect(url).toContain("order=random");
    expect(url).toContain("exclude=id1%2Cid2");
  });
});
