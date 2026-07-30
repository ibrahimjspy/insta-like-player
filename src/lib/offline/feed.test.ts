import { describe, expect, it } from "vitest";

import { orderOfflineReels } from "@/lib/offline/feed";
import type { OfflineReelRecord } from "@/lib/offline/types";

function reel(id: string, likedAt: string): OfflineReelRecord {
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
  };
}

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

  it("returns a deterministic shuffled order for a seed", () => {
    const first = orderOfflineReels(records, "random", 42).map((r) => r.id);
    const second = orderOfflineReels(records, "random", 42).map((r) => r.id);
    expect(first).toEqual(second);
    expect(first).toHaveLength(records.length);
    expect(new Set(first)).toEqual(new Set(records.map((r) => r.id)));
  });
});
