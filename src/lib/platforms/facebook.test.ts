import { describe, expect, it } from "vitest";

import {
  extractFacebookVideoId,
  isFacebookVideoUrl,
  parseFacebookLikes,
} from "@/lib/platforms/facebook";

describe("extractFacebookVideoId", () => {
  it("parses reel URLs", () => {
    expect(extractFacebookVideoId("https://www.facebook.com/reel/4364570517119853")).toBe(
      "4364570517119853",
    );
  });

  it("parses watch URLs", () => {
    expect(
      extractFacebookVideoId("https://www.facebook.com/watch/?v=1234567890123456"),
    ).toBe("1234567890123456");
  });
});

describe("isFacebookVideoUrl", () => {
  it("accepts video links and rejects plain posts", () => {
    expect(isFacebookVideoUrl("https://www.facebook.com/reel/123")).toBe(true);
    expect(isFacebookVideoUrl("https://www.facebook.com/somepage/posts/123")).toBe(false);
  });
});

describe("parseFacebookLikes", () => {
  it("parses legacy string_list_data entries with video hrefs", () => {
    const raw = {
      likes_media_likes: [
        {
          title: "NASA",
          string_list_data: [
            {
              href: "https://www.facebook.com/reel/4364570517119853/",
              timestamp: 1714500000,
            },
          ],
        },
      ],
    };

    const likes = parseFacebookLikes(raw);
    expect(likes).toHaveLength(1);
    expect(likes[0]).toMatchObject({
      platform: "FACEBOOK",
      shortcode: "4364570517119853",
      creatorUsername: "NASA",
    });
  });

  it("parses reactions entries that embed a video uri", () => {
    const raw = {
      reactions: [
        {
          timestamp: 1714500000,
          title: "Cool reel",
          data: [{ uri: "https://www.facebook.com/reel/999888777666/" }],
        },
      ],
    };

    const likes = parseFacebookLikes(raw);
    expect(likes[0]?.shortcode).toBe("999888777666");
  });

  it("skips non-video reactions", () => {
    const raw = {
      reactions: [
        {
          timestamp: 1,
          title: "Just a text post",
          data: [{ uri: "https://www.facebook.com/groups/123/posts/456" }],
        },
      ],
    };
    expect(parseFacebookLikes(raw)).toEqual([]);
  });
});
