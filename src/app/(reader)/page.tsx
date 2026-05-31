import { OrderSelect } from "@/components/OrderSelect";
import { ReelFeed } from "@/components/ReelFeed";
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
    <div className="relative">
      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <OrderSelect value={order} />
      </div>
      <ReelFeed
        key={order}
        initialItems={page.items}
        initialCursor={page.nextCursor}
        order={order}
      />
    </div>
  );
}
