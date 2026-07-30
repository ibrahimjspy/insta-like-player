import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OFFLINE_CONFIG } from "@/lib/offline/config";
import { markAutoRefreshDone, shouldAutoRefreshNow } from "@/lib/offline/sync";

describe("shouldAutoRefreshNow", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
      },
    });
  });

  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.sessionStorage;
  });

  it("allows refresh when never run", () => {
    expect(shouldAutoRefreshNow(1_000_000)).toBe(true);
  });

  it("blocks within cooldown and allows after", () => {
    const t0 = 1_000_000;
    markAutoRefreshDone(t0);
    expect(shouldAutoRefreshNow(t0 + 1_000)).toBe(false);
    expect(
      shouldAutoRefreshNow(t0 + OFFLINE_CONFIG.autoRefreshCooldownMs + 1),
    ).toBe(true);
  });
});
