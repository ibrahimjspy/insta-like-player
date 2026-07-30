import { describe, expect, it } from "vitest";

import {
  isEligibleOfflineFile,
  isOfflineAllowedPlatform,
  pickEvictions,
  selectWithinBudget,
  sortOfflineCandidates,
} from "@/lib/offline/policy";

describe("isOfflineAllowedPlatform", () => {
  it("allows Instagram and TikTok only", () => {
    expect(isOfflineAllowedPlatform("INSTAGRAM")).toBe(true);
    expect(isOfflineAllowedPlatform("TIKTOK")).toBe(true);
    expect(isOfflineAllowedPlatform("FACEBOOK")).toBe(false);
  });
});

describe("isEligibleOfflineFile", () => {
  it("rejects Facebook and oversized files", () => {
    expect(isEligibleOfflineFile({ platform: "FACEBOOK", byteSize: 1_000_000 })).toBe(false);
    expect(
      isEligibleOfflineFile({ platform: "INSTAGRAM", byteSize: 100 * 1024 * 1024 }),
    ).toBe(false);
    expect(isEligibleOfflineFile({ platform: "TIKTOK", byteSize: 0 })).toBe(false);
    expect(isEligibleOfflineFile({ platform: "TIKTOK", byteSize: 2_000_000 })).toBe(true);
  });
});

describe("sortOfflineCandidates", () => {
  it("puts higher priority first, then smaller files", () => {
    const sorted = sortOfflineCandidates([
      { id: "a", platform: "INSTAGRAM", byteSize: 5, isFavorite: false, priority: 1 },
      { id: "b", platform: "INSTAGRAM", byteSize: 3, isFavorite: true, priority: 10 },
      { id: "c", platform: "TIKTOK", byteSize: 1, isFavorite: true, priority: 10 },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("pickEvictions", () => {
  it("never evicts favorites or pinned", () => {
    const cached = [
      { id: "fav", platform: "INSTAGRAM" as const, byteSize: 8, isFavorite: true, priority: 10 },
      {
        id: "pin",
        platform: "TIKTOK" as const,
        byteSize: 4,
        isFavorite: false,
        isPinned: true,
        priority: 2,
      },
      { id: "old", platform: "TIKTOK" as const, byteSize: 5, isFavorite: false, priority: 1 },
    ];
    const evict = pickEvictions(cached, neededBytes(3), 10);
    expect(evict.map((r) => r.id)).toEqual(["old"]);
  });

  it("returns empty when already under budget", () => {
    const cached = [
      { id: "a", platform: "INSTAGRAM" as const, byteSize: 2, isFavorite: false, priority: 1 },
    ];
    expect(pickEvictions(cached, 1, 10)).toEqual([]);
  });
});

describe("selectWithinBudget", () => {
  it("packs until the cap without exceeding it", () => {
    const selected = selectWithinBudget(
      [
        { id: "a", platform: "INSTAGRAM", byteSize: 4, isFavorite: true, priority: 10 },
        { id: "b", platform: "TIKTOK", byteSize: 4, isFavorite: false, priority: 5 },
        { id: "c", platform: "INSTAGRAM", byteSize: 3, isFavorite: false, priority: 4 },
      ],
      8,
    );
    expect(selected.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

function neededBytes(n: number) {
  return n;
}
