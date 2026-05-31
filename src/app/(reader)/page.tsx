import { FeedPageClient } from "@/components/FeedPageClient";
import { getFeed, type FeedOrder } from "@/lib/queries";

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

  const page = await getFeed({ order });

  return (
    <FeedPageClient
      order={order}
      initialItems={page.items}
      initialCursor={page.nextCursor}
    />
  );
}
