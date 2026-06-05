import { describe, expect, it } from "vitest";

import {
  extractTikTokVideoId,
  normalizeTikTokUrl,
  parseTikTokLikes,
} from "@/lib/platforms/tiktok";

describe("extractTikTokVideoId", () => {
  it("parses canonical video URLs", () => {
    expect(
      extractTikTokVideoId("https://www.tiktok.com/@nasa/video/7204803049351695622"),
    ).toBe("7204803049351695622");
  });

  it("parses share URLs from data exports", () => {
    expect(
      extractTikTokVideoId("https://www.tiktokv.com/share/video/6951866814787833094/"),
    ).toBe("6951866814787833094");
  });
});

describe("normalizeTikTokUrl", () => {
  it("rewrites share links into canonical form", () => {
    expect(normalizeTikTokUrl("https://www.tiktokv.com/share/video/1234567890/")).toBe(
      "https://www.tiktok.com/@user/video/1234567890",
    );
  });
});

describe("parseTikTokLikes", () => {
  it("parses Activity.Like List.ItemFavoriteList export shape", () => {
    const raw = {
      Activity: {
        "Like List": {
          ItemFavoriteList: [
            {
              Date: "2024-05-01 12:00:00",
              Link: "https://www.tiktok.com/@nasa/video/7204803049351695622",
            },
          ],
        },
      },
    };

    const likes = parseTikTokLikes(raw);
    expect(likes).toHaveLength(1);
    expect(likes[0]).toMatchObject({
      platform: "TIKTOK",
      shortcode: "7204803049351695622",
      creatorUsername: "nasa",
    });
    expect(likes[0].likedAt?.getTime()).toBe(Date.parse("2024-05-01T12:00:00"));
  });

  it("parses the 'Likes and Favorites' wrapper with lowercase keys", () => {
    const raw = {
      "Likes and Favorites": {
        "Like List": {
          App: 1,
          ItemFavoriteList: [
            {
              date: "2025-10-22 03:06:43",
              link: "https://www.tiktokv.com/share/video/7563768034519715090/",
            },
          ],
        },
      },
    };

    const likes = parseTikTokLikes(raw);
    expect(likes).toHaveLength(1);
    expect(likes[0]).toMatchObject({
      platform: "TIKTOK",
      shortcode: "7563768034519715090",
    });
    expect(likes[0].reelUrl).toBe(
      "https://www.tiktok.com/@user/video/7563768034519715090",
    );
  });

  it("deduplicates repeated video ids", () => {
    const raw = {
      Activity: {
        "Like List": {
          ItemFavoriteList: [
            { Link: "https://www.tiktok.com/@a/video/111" },
            { Link: "https://www.tiktokv.com/share/video/111/" },
          ],
        },
      },
    };
    expect(parseTikTokLikes(raw)).toHaveLength(1);
  });
});
