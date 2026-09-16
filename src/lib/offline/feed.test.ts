import { describe, expect, it } from "vitest";

import {
  nextOfflineRandomPage,
  orderOfflineReels,
  startWithResume,
} from "@/lib/offline/feed";
import type { OfflineReelRecord } from "@/lib/offline/types";
import type { WatchIndex } from "@/lib/feed/watch-index";

function reel(
  id: string,
  likedAt: string,
  extra: Partial<OfflineReelRecord> = {},
): OfflineReelRecord {
  return {
    id,
    platform: "INSTAGRAM",
    shortcode: id,
    reelUrl: `https://example.com/${id}`,
    caption: null,
    durationSec: null,
    width: null,
    height: null,
    likedAt,
    isFavorite: false,
    creator: null,
    byteSize: 1,
    savedAt: likedAt,
    pinned: false,
    videoBlob: new Blob(),
    thumbBlob: null,
    ...extra,
  };
}

const NOW = Date.parse("2026-09-16T12:00:00.000Z");

describe("orderOfflineReels", () => {
  const records = [
    reel("middle", "2025-02-01T00:00:00.000Z"),
    reel("newest", "2025-03-01T00:00:00.000Z"),
    reel("oldest", "2025-01-01T00:00:00.000Z"),
  ];

  it("orders recent and oldest by likedAt", () => {
    expect(orderOfflineReels(records, "recent", 1).map((r) => r.id)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
    expect(orderOfflineReels(records, "oldest", 1).map((r) => r.id)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
  });

  it("returns a deterministic shuffled order for a seed when nothing is watched", () => {
    const first = orderOfflineReels(records, "random", 42).map((r) => r.id);
    const second = orderOfflineReels(records, "random", 42).map((r) => r.id);
    expect(first).toEqual(second);
    expect(first).toHaveLength(records.length);
    expect(new Set(first)).toEqual(new Set(records.map((r) => r.id)));
  });

  it("puts unseen clips before ones watched in the last few hours", () => {
    const watched: WatchIndex = {
      newest: { lastWatchedAt: NOW - 30 * 60 * 1000, watchCount: 1 },
      middle: { lastWatchedAt: NOW - 30 * 60 * 1000, watchCount: 1 },
    };
    const ids = orderOfflineReels(records, "random", 7, watched, NOW).map(
      (r) => r.id,
    );
    expect(ids[0]).toBe("oldest");
    expect(ids.slice(1).sort()).toEqual(["middle", "newest"]);
  });

  it("changes the unseen shuffle when the seed changes", () => {
    const unseen = [
      reel("a", "2025-01-01T00:00:00.000Z"),
      reel("b", "2025-01-02T00:00:00.000Z"),
      reel("c", "2025-01-03T00:00:00.000Z"),
      reel("d", "2025-01-04T00:00:00.000Z"),
      reel("e", "2025-01-05T00:00:00.000Z"),
    ];
    const first = orderOfflineReels(unseen, "random", 1, {}, NOW).map((r) => r.id);
    const second = orderOfflineReels(unseen, "random", 2, {}, NOW).map((r) => r.id);
    expect(first).not.toEqual(second);
  });
});

describe("startWithResume", () => {
  it("moves the resume clip to the front without duplicating it", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(startWithResume(items, "c").map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(startWithResume(items, "a")).toBe(items);
    expect(startWithResume(items, null)).toBe(items);
  });
});

describe("nextOfflineRandomPage", () => {
  const pool = [
    reel("a", "2025-01-01T00:00:00.000Z"),
    reel("b", "2025-01-02T00:00:00.000Z"),
    reel("c", "2025-01-03T00:00:00.000Z"),
  ];

  it("skips ids already shown this session", () => {
    const page = nextOfflineRandomPage(pool, ["a", "b"], 3, {}, 10, NOW);
    expect(page.map((r) => r.id)).toEqual(["c"]);
  });

  it("wraps instead of returning empty once every clip has been shown", () => {
    const page = nextOfflineRandomPage(pool, ["a", "b", "c"], 3, {}, 10, NOW);
    expect(page.length).toBeGreaterThan(0);
    expect(page[0].id).not.toBe("c");
    expect(new Set(page.map((r) => r.id)).size).toBe(page.length);
  });

  it("still returns the only clip when the pocket has a single video", () => {
    const one = [pool[0]];
    expect(
      nextOfflineRandomPage(one, ["a"], 1, {}, 10, NOW).map((r) => r.id),
    ).toEqual(["a"]);
  });
});
