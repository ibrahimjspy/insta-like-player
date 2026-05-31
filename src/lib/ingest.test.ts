import { beforeEach, describe, expect, it, vi } from "vitest";

const reelFindUnique = vi.fn();
const reelCreate = vi.fn();
const creatorUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    reel: {
      findUnique: (...args: unknown[]) => reelFindUnique(...args),
      create: (...args: unknown[]) => reelCreate(...args),
    },
    creator: {
      upsert: (...args: unknown[]) => creatorUpsert(...args),
    },
  },
}));

import { importLikes, parseLikedPosts } from "@/lib/ingest";

describe("parseLikedPosts", () => {
  it("parses the standard likes_media_likes export shape", () => {
    const raw = {
      likes_media_likes: [
        {
          title: "natgeo",
          string_list_data: [
            { href: "https://www.instagram.com/reel/ABC123/", timestamp: 1714500000 },
          ],
        },
      ],
    };

    const likes = parseLikedPosts(raw);
    expect(likes).toHaveLength(1);
    expect(likes[0]).toMatchObject({
      shortcode: "ABC123",
      reelUrl: "https://www.instagram.com/reel/ABC123/",
      creatorUsername: "natgeo",
    });
    expect(likes[0].likedAt?.getTime()).toBe(1714500000 * 1000);
  });

  it("handles a missing title as a null creator", () => {
    const raw = {
      likes_media_likes: [
        { string_list_data: [{ href: "https://www.instagram.com/reel/ABC123/" }] },
      ],
    };
    expect(parseLikedPosts(raw)[0].creatorUsername).toBeNull();
  });

  it("sets likedAt to null when there is no timestamp", () => {
    const raw = {
      likes_media_likes: [
        { title: "x", string_list_data: [{ href: "https://www.instagram.com/reel/ABC123/" }] },
      ],
    };
    expect(parseLikedPosts(raw)[0].likedAt).toBeNull();
  });

  it("skips entries that aren't Instagram media links", () => {
    const raw = {
      likes_media_likes: [
        { title: "x", string_list_data: [{ href: "https://example.com/foo" }] },
        {
          title: "y",
          string_list_data: [{ href: "https://www.instagram.com/reel/GOOD1/" }],
        },
      ],
    };
    const likes = parseLikedPosts(raw);
    expect(likes).toHaveLength(1);
    expect(likes[0].shortcode).toBe("GOOD1");
  });

  it("supports a top-level array and a 'likes' key as fallbacks", () => {
    const asArray = [
      { title: "a", string_list_data: [{ href: "https://www.instagram.com/reel/AAA/" }] },
    ];
    const asLikesKey = {
      likes: [
        { title: "b", string_list_data: [{ href: "https://www.instagram.com/reel/BBB/" }] },
      ],
    };
    expect(parseLikedPosts(asArray)[0].shortcode).toBe("AAA");
    expect(parseLikedPosts(asLikesKey)[0].shortcode).toBe("BBB");
  });

  it("returns an empty array for empty or unexpected input", () => {
    expect(parseLikedPosts({})).toEqual([]);
    expect(parseLikedPosts(null)).toEqual([]);
    expect(parseLikedPosts({ likes_media_likes: [] })).toEqual([]);
  });
});

describe("parseLikedPosts (current label_values format)", () => {
  const entry = {
    timestamp: 1780005469,
    media: [],
    label_values: [
      {
        label: "URL",
        value: "https://www.instagram.com/reel/DY0odpgTBqk/",
        href: "https://www.instagram.com/reel/DY0odpgTBqk/",
      },
      { label: "Caption", value: "A great reel #kdrama #fun" },
      { label: "Title", value: "" },
      {
        title: "Owner",
        dict: [{ dict: [{ label: "Username", value: "spideey_k" }], title: "" }],
      },
    ],
  };

  it("extracts url, caption, creator and liked time", () => {
    const [like] = parseLikedPosts([entry]);
    expect(like).toEqual({
      shortcode: "DY0odpgTBqk",
      reelUrl: "https://www.instagram.com/reel/DY0odpgTBqk/",
      creatorUsername: "spideey_k",
      caption: "A great reel #kdrama #fun",
      likedAt: new Date(1780005469 * 1000),
    });
  });

  it("falls back to the URL href when value is missing", () => {
    const e = {
      timestamp: 1,
      label_values: [{ label: "URL", href: "https://www.instagram.com/reel/ABC123/" }],
    };
    expect(parseLikedPosts([e])[0].shortcode).toBe("ABC123");
  });

  it("handles a missing owner / caption gracefully", () => {
    const e = {
      timestamp: 1,
      label_values: [
        { label: "URL", value: "https://www.instagram.com/reel/ABC123/" },
      ],
    };
    const [like] = parseLikedPosts([e]);
    expect(like.creatorUsername).toBeNull();
    expect(like.caption).toBeNull();
  });

  it("skips entries without a recognisable URL", () => {
    const e = { timestamp: 1, label_values: [{ label: "Caption", value: "no url here" }] };
    expect(parseLikedPosts([e])).toEqual([]);
  });
});

describe("importLikes", () => {
  beforeEach(() => {
    reelFindUnique.mockReset();
    reelCreate.mockReset();
    creatorUpsert.mockReset();
  });

  const sampleLike = {
    shortcode: "ABC123",
    reelUrl: "https://www.instagram.com/reel/ABC123/",
    creatorUsername: "nasa",
    likedAt: new Date("2024-05-01T00:00:00Z"),
    caption: "to the moon #space",
  };

  it("creates a new reel and its creator", async () => {
    reelFindUnique.mockResolvedValue(null);
    creatorUpsert.mockResolvedValue({ id: "creator-1" });
    reelCreate.mockResolvedValue({});

    const result = await importLikes([sampleLike]);

    expect(result.imported).toBe(1);
    expect(result.skippedDuplicates).toBe(0);
    expect(creatorUpsert).toHaveBeenCalledWith({
      where: { username: "nasa" },
      create: { username: "nasa" },
      update: {},
    });
    expect(reelCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shortcode: "ABC123",
          creatorId: "creator-1",
          status: "PENDING",
        }),
      }),
    );
  });

  it("skips a reel that already exists (idempotent re-import)", async () => {
    reelFindUnique.mockResolvedValue({ id: "existing" });

    const result = await importLikes([sampleLike]);

    expect(result.imported).toBe(0);
    expect(result.skippedDuplicates).toBe(1);
    expect(reelCreate).not.toHaveBeenCalled();
    expect(creatorUpsert).not.toHaveBeenCalled();
  });

  it("creates a reel without a creator when username is null", async () => {
    reelFindUnique.mockResolvedValue(null);
    reelCreate.mockResolvedValue({});

    const result = await importLikes([{ ...sampleLike, creatorUsername: null }]);

    expect(result.imported).toBe(1);
    expect(creatorUpsert).not.toHaveBeenCalled();
    expect(reelCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ creatorId: undefined }),
      }),
    );
  });

  it("counts likes with an empty shortcode as unparseable", async () => {
    const result = await importLikes([{ ...sampleLike, shortcode: "" }]);
    expect(result.skippedUnparseable).toBe(1);
    expect(result.imported).toBe(0);
  });

  it("reports the total number parsed", async () => {
    reelFindUnique.mockResolvedValue({ id: "existing" });
    const result = await importLikes([sampleLike, sampleLike]);
    expect(result.parsed).toBe(2);
  });
});
