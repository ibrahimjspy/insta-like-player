import { afterEach, describe, expect, it, vi } from "vitest";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  markWatched,
  readWatchIndex,
  recentWatchedIds,
} from "@/lib/feed/watch-index";

afterEach(() => vi.unstubAllGlobals());

function storage(seed: Record<string, string> = {}) {
  const values = new Map<string, string>(Object.entries(seed));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  });
  return values;
}

describe("watch index", () => {
  it("records recency and increments watchCount", () => {
    storage();
    markWatched("a", 1000);
    markWatched("a", 2000);
    expect(readWatchIndex()).toEqual({
      a: { lastWatchedAt: 2000, watchCount: 2 },
    });
  });

  it("returns newest-first ids inside the recency window", () => {
    storage();
    markWatched("old", 1);
    markWatched("mid", 50);
    markWatched("new", 100);
    expect(recentWatchedIds(readWatchIndex(), 100, 60, 10)).toEqual([
      "new",
      "mid",
    ]);
  });

  it("trims to max entries, keeping the most recently written", () => {
    storage();
    const max = FEED_TASTE_CONFIG.watchIndex.maxEntries;
    for (let i = 0; i < max + 3; i += 1) {
      markWatched(`reel-${i}`, i + 1);
    }
    const index = readWatchIndex();
    expect(Object.keys(index)).toHaveLength(max);
    expect(index["reel-0"]).toBeUndefined();
    expect(index[`reel-${max + 2}`]?.watchCount).toBe(1);
  });

  it("ignores corrupt storage and write failures", () => {
    storage({ [FEED_TASTE_CONFIG.watchIndex.storageKey]: "nope" });
    expect(readWatchIndex()).toEqual({});
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(readWatchIndex()).toEqual({});
    expect(() => markWatched("a", 1)).not.toThrow();
  });
});
