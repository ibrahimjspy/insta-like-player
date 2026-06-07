import { FeedPageClient } from "@/components/FeedPageClient";
import { getCollections, getFeed, type FeedOrder } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ORDERS: FeedOrder[] = ["recent", "oldest", "random"];

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderParam } = await searchParams;
  const order: FeedOrder =
    orderParam && ORDERS.includes(orderParam as FeedOrder)
      ? (orderParam as FeedOrder)
      : "recent";

  const [page, collections] = await Promise.all([
    getFeed({ order }),
    getCollections(),
  ]);

  return (
    <FeedPageClient
      order={order}
      initialItems={page.items}
      initialCursor={page.nextCursor}
      collections={collections.map(({ id, name }) => ({ id, name }))}
    />
  );
}
