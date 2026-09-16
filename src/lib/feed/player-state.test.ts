import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPosition, readPosition, savePosition, setPositionWritesEnabled } from "./player-state";

afterEach(() => {
  setPositionWritesEnabled(true);
  vi.unstubAllGlobals();
});

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
  return values;
}

describe("playback persistence", () => {
  it("keeps independent positions across orders and online/offline feeds", () => {
    storage();
    savePosition("offline_recent", { reelId: "a", time: 12.5 });
    savePosition("offline_oldest", { reelId: "b", time: 30 });
    savePosition("online_recent", { reelId: "c", time: 4 });
    expect(readPosition("offline_recent")).toEqual({ reelId: "a", time: 12.5 });
    expect(readPosition("offline_oldest")).toEqual({ reelId: "b", time: 30 });
    expect(readPosition("online_recent")).toEqual({ reelId: "c", time: 4 });
  });
  it("ignores corrupt or invalid saved positions", () => {
    const values = storage();
    for (const raw of ["oops", "null", '{}', '{"reelId":"a","time":-1}', '{"reelId":"a","time":"3"}']) {
      values.set("position", raw);
      expect(readPosition("position")).toBeNull();
    }
  });
  it("works when browser storage is denied", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } });
    expect(readPosition("position")).toBeNull();
    expect(() => savePosition("position", { reelId: "a", time: 2 })).not.toThrow();
    expect(() => clearPosition("position")).not.toThrow();
  });

  it("can suppress writes while a feed restart unmounts the current slide", () => {
    const values = storage();
    savePosition("position", { reelId: "a", time: 8 });
    setPositionWritesEnabled(false);
    savePosition("position", { reelId: "b", time: 99 });
    expect(readPosition("position")).toEqual({ reelId: "a", time: 8 });
    clearPosition("position");
    expect(values.has("position")).toBe(false);
    setPositionWritesEnabled(true);
    savePosition("position", { reelId: "c", time: 1 });
    expect(readPosition("position")).toEqual({ reelId: "c", time: 1 });
  });
});
