import { afterEach, describe, expect, it, vi } from "vitest";
import { rankAutoQueue, readInterest, recordManualInterest } from "./auto-ranking";
import type { FeedItem } from "./feed-pagination";

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}
const item = (id: string, favorite = false) => ({ id, feedKey: id, isFavorite: favorite }) as FeedItem;
afterEach(() => vi.unstubAllGlobals());

describe("automatic For you queue", () => {
  it("keeps history and the current video in place while promoting favorites and enjoyed clips", () => {
    const items = [item("history"), item("current"), item("skip"), item("new"), item("favorite", true), item("enjoyed")];
    expect(rankAutoQueue(items, "current", "random", true, { skip: -2, enjoyed: 3 }).map((r) => r.id))
      .toEqual(["history", "current", "enjoyed", "favorite", "new", "skip"]);
  });
  it("never changes Recent, Oldest, or manual For you", () => {
    const items = [item("a"), item("b", true)];
    expect(rankAutoQueue(items, null, "recent", true, {})).toBe(items);
    expect(rankAutoQueue(items, null, "oldest", true, {})).toBe(items);
    expect(rankAutoQueue(items, null, "random", false, {})).toBe(items);
  });
  it("preserves shuffled/server order when signals are equal", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(rankAutoQueue(items, "a", "random", true, {})).toBe(items);
  });
});

describe("local interest", () => {
  it("learns completions and quick skips from deliberate browsing", () => {
    storage();
    recordManualInterest("enjoyed", 18, 20, false);
    recordManualInterest("skip", 2, 20, false);
    recordManualInterest("short", 2, 2, false);
    expect(readInterest()).toEqual({ enjoyed: 1, skip: -1, short: 1 });
  });
  it("does not mistake unattended playback, brief loads, or partial views for preference", () => {
    storage();
    recordManualInterest("auto", 100, 20, true);
    recordManualInterest("brief", 0.1, 20, false);
    recordManualInterest("partial", 10, 30, false);
    expect(readInterest()).toEqual({});
  });
  it("bounds preferences and tolerates corrupt or unavailable storage", () => {
    const values = storage();
    values.set("ilp_manual_interest", '{"bad":"3","huge":100,"good":2}');
    expect(readInterest()).toEqual({ good: 2 });
    for (let i = 0; i < 10; i++) recordManualInterest("good", 20, 20, false);
    expect(readInterest().good).toBe(3);
    values.set("ilp_manual_interest", 'broken');
    expect(readInterest()).toEqual({});
    vi.stubGlobal("localStorage", { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
    expect(() => recordManualInterest("a", 20, 20, false)).not.toThrow();
  });
});
