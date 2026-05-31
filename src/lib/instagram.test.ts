import { describe, expect, it } from "vitest";

import { canonicalReelUrl, extractShortcode, parseHashtags } from "@/lib/instagram";

describe("extractShortcode", () => {
  it("extracts from a /reel/ URL", () => {
    expect(extractShortcode("https://www.instagram.com/reel/ABC123/")).toBe("ABC123");
  });

  it("extracts from /reels/, /p/ and /tv/ paths", () => {
    expect(extractShortcode("https://instagram.com/reels/Xy_Z-9/")).toBe("Xy_Z-9");
    expect(extractShortcode("https://www.instagram.com/p/CdEfGh/")).toBe("CdEfGh");
    expect(extractShortcode("https://www.instagram.com/tv/LongTv01/")).toBe("LongTv01");
  });

  it("ignores query strings and trailing segments", () => {
    expect(
      extractShortcode("https://www.instagram.com/reel/ABC123/?igshid=abc&utm=1"),
    ).toBe("ABC123");
  });

  it("works without protocol or www", () => {
    expect(extractShortcode("instagram.com/reel/ABC123")).toBe("ABC123");
  });

  it("preserves hyphens and underscores in the shortcode", () => {
    expect(extractShortcode("https://www.instagram.com/reel/A-b_C1/")).toBe("A-b_C1");
  });

  it("returns null for non-Instagram or unrecognised URLs", () => {
    expect(extractShortcode("https://example.com/reel/ABC123/")).toBeNull();
    expect(extractShortcode("https://www.instagram.com/someuser/")).toBeNull();
    expect(extractShortcode("not a url")).toBeNull();
    expect(extractShortcode("")).toBeNull();
  });
});

describe("canonicalReelUrl", () => {
  it("builds a canonical reel URL from a shortcode", () => {
    expect(canonicalReelUrl("ABC123")).toBe("https://www.instagram.com/reel/ABC123/");
  });

  it("round-trips with extractShortcode", () => {
    const code = "Xy_Z-9";
    expect(extractShortcode(canonicalReelUrl(code))).toBe(code);
  });
});

describe("parseHashtags", () => {
  it("extracts hashtags without the leading #", () => {
    expect(parseHashtags("Loving this #coffee and #Travel")).toEqual(["coffee", "travel"]);
  });

  it("lower-cases and de-duplicates tags", () => {
    expect(parseHashtags("#Fun #fun #FUN")).toEqual(["fun"]);
  });

  it("supports unicode and underscores", () => {
    expect(parseHashtags("#café #road_trip #日本")).toEqual(["café", "road_trip", "日本"]);
  });

  it("returns an empty array when there are no tags", () => {
    expect(parseHashtags("just a normal caption")).toEqual([]);
  });

  it("handles null and undefined captions", () => {
    expect(parseHashtags(null)).toEqual([]);
    expect(parseHashtags(undefined)).toEqual([]);
    expect(parseHashtags("")).toEqual([]);
  });

  it("does not treat a bare # as a tag", () => {
    expect(parseHashtags("a # b")).toEqual([]);
  });
});
