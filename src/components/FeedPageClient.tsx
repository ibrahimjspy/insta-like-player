"use client";

import { useCallback, useState } from "react";

import { OrderSelect } from "@/components/OrderSelect";
import { ReelFeed } from "@/components/ReelFeed";
import type { ReelView } from "@/lib/types";
import type { FeedOrder } from "@/lib/queries";

interface Props {
  order: FeedOrder;
  initialItems: ReelView[];
  initialCursor: string | null;
}

export function FeedPageClient({ order, initialItems, initialCursor }: Props) {
  const [showOrderBar, setShowOrderBar] = useState(initialItems.length === 0);

  const onOrderBarVisibility = useCallback((visible: boolean) => {
    setShowOrderBar(visible);
  }, []);

  return (
    <div className="relative h-full">
      <div
        className={`absolute inset-x-0 top-0 z-10 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-200 ${
          showOrderBar ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!showOrderBar}
      >
        <OrderSelect value={order} />
      </div>
      <ReelFeed
        key={order}
        initialItems={initialItems}
        initialCursor={initialCursor}
        order={order}
        onOrderBarVisibility={onOrderBarVisibility}
      />
    </div>
  );
}
