import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import type { FeedOrder } from "@/lib/queries";
import type { ReelView } from "@/lib/types";

/** Stable list keys so For you can surface the same reel twice without React collisions. */
export type FeedItem = ReelView & { feedKey: string };

export function withFeedKeys(reels: ReelView[], offset = 0): FeedItem[] {
  return reels.map((r, i) => ({
    ...r,
    feedKey: `${r.id}-${offset + i}`,
  }));
}

/** Whether the feed should attempt another page fetch. */
export function shouldLoadMoreFeed(params: {
  paginate: boolean;
  order: FeedOrder;
  cursor: string | null;
  randomExhausted: boolean;
}): boolean {
  if (!params.paginate) return false;
  if (params.order === "random") return !params.randomExhausted;
  return params.cursor !== null;
}

/** Updates cursor / exhaustion after a successful fetch. */
export function nextFeedPaginationState(params: {
  order: FeedOrder;
  cursor: string | null;
  randomExhausted: boolean;
  page: { items: ReelView[]; nextCursor: string | null };
}): { cursor: string | null; randomExhausted: boolean } {
  if (params.order === "random") {
    const exhausted =
      params.page.items.length === 0 || params.page.nextCursor === null;
    return { cursor: params.cursor, randomExhausted: exhausted || params.randomExhausted };
  }
  return {
    cursor: params.page.nextCursor,
    randomExhausted: params.randomExhausted,
  };
}

/** LRU-style list of reel ids shown this session (for For you exclude). */
export function trackRecentReelId(
  recent: readonly string[],
  reelId: string,
  max: number = FEED_TASTE_CONFIG.exclude.maxSessionIds,
): string[] {
  if (recent[recent.length - 1] === reelId) return [...recent];
  return [...recent.filter((id) => id !== reelId), reelId].slice(-max);
}

export function buildFeedFetchUrl(params: {
  order: FeedOrder;
  cursor: string | null;
  excludeReelIds: string[];
}): string {
  if (params.order === "random") {
    const exclude =
      params.excludeReelIds.length > 0
        ? `&exclude=${encodeURIComponent(params.excludeReelIds.join(","))}`
        : "";
    return `/api/reels?order=random${exclude}`;
  }
  return `/api/reels?order=${params.order}&cursor=${encodeURIComponent(params.cursor ?? "")}`;
}
