import { describe, expect, it } from "vitest";

import { feedOrderPath, parseFeedOrder, resolveFeedOrder } from "@/lib/feed/order";

describe("parseFeedOrder", () => {
  it("accepts recent, oldest, and random", () => {
    expect(parseFeedOrder("recent")).toBe("recent");
    expect(parseFeedOrder("oldest")).toBe("oldest");
    expect(parseFeedOrder("random")).toBe("random");
  });

  it("rejects missing or unknown values", () => {
    expect(parseFeedOrder(null)).toBeNull();
    expect(parseFeedOrder(undefined)).toBeNull();
    expect(parseFeedOrder("")).toBeNull();
    expect(parseFeedOrder("for-you")).toBeNull();
  });
});

describe("resolveFeedOrder", () => {
  it("prefers the URL over the saved last tab", () => {
    expect(resolveFeedOrder("random", "recent")).toBe("random");
  });

  it("falls back to the saved last tab when the URL has no order", () => {
    expect(resolveFeedOrder(null, "oldest")).toBe("oldest");
    expect(resolveFeedOrder("nope", "random")).toBe("random");
  });

  it("defaults to recent", () => {
    expect(resolveFeedOrder(null, null)).toBe("recent");
  });
});

describe("feedOrderPath", () => {
  it("writes the order query string", () => {
    expect(feedOrderPath("random")).toBe("/?order=random");
  });
});
