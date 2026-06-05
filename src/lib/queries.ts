import { Platform, Prisma, ReelStatus } from "@prisma/client";

import { config } from "@/lib/config";
import { backfillEngagementFromHistory, smartFeedIdsQuery } from "@/lib/feed";
import { prisma } from "@/lib/db";

/// Fields needed to render a reel card / player. Shared across reader views.
export const reelCardSelect = {
  id: true,
  platform: true,
  shortcode: true,
  reelUrl: true,
  caption: true,
  videoPath: true,
  thumbnailPath: true,
  durationSec: true,
  width: true,
  height: true,
  likedAt: true,
  isFavorite: true,
  creator: { select: { username: true, platform: true } },
} satisfies Prisma.ReelSelect;

export type ReelCard = Prisma.ReelGetPayload<{ select: typeof reelCardSelect }>;

export type FeedOrder = "recent" | "oldest" | "random";

export interface FeedPage {
  items: ReelCard[];
  nextCursor: string | null;
}

/// Returns a page of playable (DOWNLOADED) reels for the infinite feed.
/// Cursor pagination for recent/oldest; random is a taste-aware ranked batch (infinite).
export async function getFeed(params: {
  order?: FeedOrder;
  cursor?: string | null;
  take?: number;
  /// Reel ids already shown this session (For you avoids immediate repeats).
  excludeIds?: string[];
}): Promise<FeedPage> {
  const take = params.take ?? config.feedPageSize;
  const order = params.order ?? "recent";

  if (order === "random") {
    await backfillEngagementFromHistory();
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      smartFeedIdsQuery(take, params.excludeIds),
    );
    const items = await prisma.reel.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: reelCardSelect,
    });
    const orderMap = new Map(rows.map((r, i) => [r.id, i]));
    items.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    return { items, nextCursor: items.length > 0 ? "more" : null };
  }

  const direction = order === "oldest" ? "asc" : "desc";
  const rows = await prisma.reel.findMany({
    where: { status: ReelStatus.DOWNLOADED },
    orderBy: [{ likedAt: direction }, { id: direction }],
    take: take + 1,
    ...(params.cursor
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {}),
    select: reelCardSelect,
  });

  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}

/// Full-text-ish search over caption, creator username, and hashtags.
/// Uses case-insensitive contains for reliability (no tsvector setup needed).
export async function searchReels(params: {
  query?: string;
  creator?: string;
  platform?: Platform;
  take?: number;
}): Promise<ReelCard[]> {
  const q = params.query?.trim();
  const where: Prisma.ReelWhereInput = { status: ReelStatus.DOWNLOADED };

  if (params.creator) {
    where.creator = {
      username: params.creator,
      ...(params.platform ? { platform: params.platform } : {}),
    };
  }

  if (q) {
    where.OR = [
      { caption: { contains: q, mode: "insensitive" } },
      { creator: { username: { contains: q, mode: "insensitive" } } },
      { hashtags: { some: { tag: { contains: q.replace(/^#/, ""), mode: "insensitive" } } } },
    ];
  }

  return prisma.reel.findMany({
    where,
    orderBy: { likedAt: "desc" },
    take: params.take ?? 60,
    select: reelCardSelect,
  });
}

export async function getFavorites(): Promise<ReelCard[]> {
  return prisma.reel.findMany({
    where: { isFavorite: true, status: ReelStatus.DOWNLOADED },
    orderBy: { likedAt: "desc" },
    select: reelCardSelect,
  });
}

/// Distinct creators that have at least one downloaded reel, for filtering.
export async function getCreatorsWithCounts() {
  const creators = await prisma.creator.findMany({
    where: { reels: { some: { status: ReelStatus.DOWNLOADED } } },
    select: {
      platform: true,
      username: true,
      _count: { select: { reels: { where: { status: ReelStatus.DOWNLOADED } } } },
    },
    orderBy: [{ platform: "asc" }, { username: "asc" }],
  });
  return creators.map((c) => ({
    platform: c.platform,
    username: c.username,
    count: c._count.reels,
  }));
}

export async function getCollections() {
  return prisma.collection.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      _count: { select: { reels: true } },
    },
  });
}

export async function getCollection(id: string) {
  return prisma.collection.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      reels: {
        orderBy: { addedAt: "desc" },
        select: { reel: { select: reelCardSelect } },
      },
    },
  });
}

/// Aggregate stats for the admin dashboard.
export async function getLibraryStats() {
  const [total, downloaded, pending, failed, unavailable, favorites, creators, collections] =
    await Promise.all([
      prisma.reel.count(),
      prisma.reel.count({ where: { status: ReelStatus.DOWNLOADED } }),
      prisma.reel.count({ where: { status: ReelStatus.PENDING } }),
      prisma.reel.count({ where: { status: ReelStatus.FAILED } }),
      prisma.reel.count({ where: { status: ReelStatus.UNAVAILABLE } }),
      prisma.reel.count({ where: { isFavorite: true } }),
      prisma.creator.count(),
      prisma.collection.count(),
    ]);

  return { total, downloaded, pending, failed, unavailable, favorites, creators, collections };
}

/// Paginated reel list for the admin table, filterable by status / search.
export async function getAdminReels(params: {
  status?: ReelStatus;
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = params.pageSize ?? 25;
  const page = Math.max(1, params.page ?? 1);

  const where: Prisma.ReelWhereInput = {};
  if (params.status) where.status = params.status;
  if (params.query?.trim()) {
    const q = params.query.trim();
    where.OR = [
      { caption: { contains: q, mode: "insensitive" } },
      { shortcode: { contains: q, mode: "insensitive" } },
      { creator: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.reel.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        platform: true,
        shortcode: true,
        reelUrl: true,
        caption: true,
        status: true,
        isFavorite: true,
        failReason: true,
        likedAt: true,
        downloadedAt: true,
        creator: { select: { username: true, platform: true } },
      },
    }),
    prisma.reel.count({ where }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}
