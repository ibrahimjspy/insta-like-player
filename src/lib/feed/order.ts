import type { FeedOrder } from "@/lib/queries";

export const FEED_ORDERS: FeedOrder[] = ["recent", "oldest", "random"];
export const LAST_ORDER_STORAGE_KEY = "ilp_last_order";

export function parseFeedOrder(value: string | null | undefined): FeedOrder | null {
  if (value && (FEED_ORDERS as string[]).includes(value)) return value as FeedOrder;
  return null;
}

/// URL query wins; otherwise the last tab this device used; otherwise Recent.
export function resolveFeedOrder(
  urlOrder: string | null | undefined,
  savedOrder: string | null | undefined,
): FeedOrder {
  return parseFeedOrder(urlOrder) ?? parseFeedOrder(savedOrder) ?? "recent";
}

export function feedOrderPath(order: FeedOrder): string {
  return `/?order=${order}`;
}
