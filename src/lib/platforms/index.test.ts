import { describe, expect, it } from "vitest";

import { parseVideoUrl } from "@/lib/platforms";

describe("parseVideoUrl", () => {
  it("parses Instagram reel URLs", () => {
    expect(parseVideoUrl("https://www.instagram.com/reel/ABC123/?igsh=share")).toMatchObject({
      platform: "INSTAGRAM",
      shortcode: "ABC123",
      reelUrl: "https://www.instagram.com/reel/ABC123/",
      creatorUsername: null,
      caption: null,
    });
  });

  it("rejects generic Instagram posts", () => {
    expect(parseVideoUrl("https://www.instagram.com/p/ABC123/")).toBeNull();
  });

  it("parses TikTok video URLs", () => {
    expect(parseVideoUrl("https://www.tiktok.com/@creator/video/1234567890?lang=en")).toMatchObject({
      platform: "TIKTOK",
      shortcode: "1234567890",
      reelUrl: "https://www.tiktok.com/@creator/video/1234567890",
    });
  });

  it("parses Facebook reel URLs", () => {
    expect(parseVideoUrl("https://www.facebook.com/reel/987654321?mibextid=share")).toMatchObject({
      platform: "FACEBOOK",
      shortcode: "987654321",
      reelUrl: "https://www.facebook.com/reel/987654321",
    });
  });
});
