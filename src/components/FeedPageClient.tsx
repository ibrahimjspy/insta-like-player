"use client";

import { useCallback, useEffect, useState } from "react";

import { AutoScrollToggle } from "@/components/AutoScrollToggle";
import { OrderSelect } from "@/components/OrderSelect";
import { useReaderChrome } from "@/components/ReaderChromeContext";
import { ReelFeed } from "@/components/ReelFeed";
import type { ReelView } from "@/lib/types";
import type { FeedOrder } from "@/lib/queries";

interface Props {
  order: FeedOrder;
  initialItems: ReelView[];
  initialCursor: string | null;
}

export function FeedPageClient({ order, initialItems, initialCursor }: Props) {
  const { setFeedPausedChrome } = useReaderChrome();
  const [showOrderBar, setShowOrderBar] = useState(initialItems.length === 0);
  const [userPaused, setUserPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);

  const onPausedChromeVisibility = useCallback(
    (visible: boolean) => {
      setShowOrderBar(visible);
      setFeedPausedChrome(visible);
    },
    [setFeedPausedChrome],
  );

  useEffect(() => {
    if (initialItems.length === 0) setFeedPausedChrome(true);
  }, [initialItems.length, setFeedPausedChrome]);

  return (
    <div className="relative h-full">
      <div
        className={`absolute inset-x-0 top-0 z-50 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))] transition-transform duration-200 ease-out ${
          showOrderBar
            ? "pointer-events-auto translate-y-0"
            : "pointer-events-none -translate-y-full"
        }`}
        aria-hidden={!showOrderBar}
      >
        <div className="flex items-center gap-2">
          {userPaused && initialItems.length > 0 && (
            <AutoScrollToggle enabled={autoScroll} onChange={setAutoScroll} />
          )}
          <OrderSelect value={order} />
        </div>
      </div>
      <ReelFeed
        key={order}
        initialItems={initialItems}
        initialCursor={initialCursor}
        order={order}
        autoScroll={autoScroll}
        onOrderBarVisibility={onPausedChromeVisibility}
        onUserPaused={setUserPaused}
      />
    </div>
  );
}
