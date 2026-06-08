import { beforeEach, describe, expect, it, vi } from "vitest";

const reelFindMany = vi.fn();
const queryRaw = vi.fn();
const engagementCount = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    reel: { findMany: (...args: unknown[]) => reelFindMany(...args) },
    reelEngagement: { count: (...args: unknown[]) => engagementCount(...args) },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/feed")>();
  return {
    ...actual,
    backfillEngagementFromHistory: vi.fn().mockResolvedValue(undefined),
  };
});

import { getFeed, searchReels } from "@/lib/queries";

beforeEach(() => {
  reelFindMany.mockReset();
  queryRaw.mockReset();
  engagementCount.mockReset();
});

describe("getFeed (recent / oldest cursor pagination)", () => {
  it("returns a full page and a next cursor when more rows exist", async () => {
    // take=2 requests take+1=3; receiving 3 means there's another page.
    reelFindMany.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);

    const page = await getFeed({ order: "recent", take: 2 });

    expect(page.items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(page.nextCursor).toBe("2");

    const args = reelFindMany.mock.calls[0][0];
    expect(args.take).toBe(3);
    expect(args.orderBy).toEqual([{ likedAt: "desc" }, { id: "desc" }]);
    expect(args.cursor).toBeUndefined();
  });

  it("returns no cursor on the last page", async () => {
    reelFindMany.mockResolvedValue([{ id: "1" }]);

    const page = await getFeed({ order: "recent", take: 2 });

    expect(page.items.map((i) => i.id)).toEqual(["1"]);
    expect(page.nextCursor).toBeNull();
  });

  it("orders ascending for 'oldest'", async () => {
    reelFindMany.mockResolvedValue([]);
    await getFeed({ order: "oldest", take: 2 });
    expect(reelFindMany.mock.calls[0][0].orderBy).toEqual([
      { likedAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("applies the cursor with skip when paginating", async () => {
    reelFindMany.mockResolvedValue([]);
    await getFeed({ order: "recent", take: 2, cursor: "abc" });
    const args = reelFindMany.mock.calls[0][0];
    expect(args.cursor).toEqual({ id: "abc" });
    expect(args.skip).toBe(1);
  });
});

describe("getFeed (random / for you)", () => {
  it("uses taste-aware scoring sql and preserves rank order", async () => {
    queryRaw.mockResolvedValue([{ id: "r2" }, { id: "r1" }]);
    reelFindMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);

    const page = await getFeed({ order: "random", take: 2 });

    expect(queryRaw).toHaveBeenCalled();
    const sql = String(queryRaw.mock.calls[0][0]?.strings?.join("") ?? "");
    expect(sql).toContain("ReelEngagement");
    expect(sql).toContain("collection_scores");
    expect(sql).toContain("LN(");
    expect(page.items.map((i) => i.id)).toEqual(["r2", "r1"]);
    expect(page.nextCursor).toBe("more");
  });

  it("returns null cursor when the library is empty", async () => {
    queryRaw.mockResolvedValue([]);
    reelFindMany.mockResolvedValue([]);

    const page = await getFeed({ order: "random", take: 2 });

    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });
});

describe("searchReels", () => {
  it("builds an OR filter across caption, creator and hashtags", async () => {
    reelFindMany.mockResolvedValue([]);
    await searchReels({ query: "coffee" });

    const where = reelFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("DOWNLOADED");
    expect(where.OR).toEqual([
      { caption: { contains: "coffee", mode: "insensitive" } },
      { creator: { username: { contains: "coffee", mode: "insensitive" } } },
      { hashtags: { some: { tag: { contains: "coffee", mode: "insensitive" } } } },
    ]);
  });

  it("filters by exact creator when provided", async () => {
    reelFindMany.mockResolvedValue([]);
    await searchReels({ creator: "nasa" });

    const where = reelFindMany.mock.calls[0][0].where;
    expect(where.creator).toEqual({ username: "nasa" });
    expect(where.OR).toBeUndefined();
  });

  it("filters by platform when provided", async () => {
    reelFindMany.mockResolvedValue([]);
    await searchReels({ platform: "FACEBOOK" });

    const where = reelFindMany.mock.calls[0][0].where;
    expect(where.platform).toBe("FACEBOOK");
    expect(where.status).toBe("DOWNLOADED");
  });

  it("strips a leading # from a hashtag query", async () => {
    reelFindMany.mockResolvedValue([]);
    await searchReels({ query: "#travel" });

    const where = reelFindMany.mock.calls[0][0].where;
    expect(where.OR[2]).toEqual({
      hashtags: { some: { tag: { contains: "travel", mode: "insensitive" } } },
    });
  });
});
