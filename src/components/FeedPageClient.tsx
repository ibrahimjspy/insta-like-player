"use client";

import { useCallback, useEffect, useState } from "react";

import { AutoScrollToggle } from "@/components/AutoScrollToggle";
import { type CollectionOption } from "@/components/CollectionAddButton";
import { OrderSelect } from "@/components/OrderSelect";
import { useReaderChrome } from "@/components/ReaderChromeContext";
import { ReelFeed } from "@/components/ReelFeed";
import { VideoOnlyToggle } from "@/components/VideoOnlyToggle";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import type { ReelView } from "@/lib/types";
import type { FeedOrder } from "@/lib/queries";

interface Props {
  order: FeedOrder;
  initialItems: ReelView[];
  initialCursor: string | null;
  collections?: CollectionOption[];
}

export function FeedPageClient({ order, initialItems, initialCursor, collections }: Props) {
  const { setFeedPausedChrome } = useReaderChrome();
  const [showOrderBar, setShowOrderBar] = useState(initialItems.length === 0);
  const [userPaused, setUserPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [videoOnly, setVideoOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(FEED_TASTE_CONFIG.player.videoOnlyStorageKey) === "true";
  });

  const onVideoOnlyChange = useCallback((enabled: boolean) => {
    setVideoOnly(enabled);
    localStorage.setItem(FEED_TASTE_CONFIG.player.videoOnlyStorageKey, String(enabled));
  }, []);

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
        className={`absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-all duration-200 ease-out ${
          showOrderBar
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0"
        }`}
        aria-hidden={!showOrderBar}
      >
        <div className="flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-1.5 rounded-[1.35rem] border border-white/10 bg-black/45 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <OrderSelect value={order} />
          {userPaused && initialItems.length > 0 && (
            <>
              <span className="mx-0.5 hidden h-6 w-px bg-white/10 sm:block" />
              <VideoOnlyToggle enabled={videoOnly} onChange={onVideoOnlyChange} />
              <AutoScrollToggle enabled={autoScroll} onChange={setAutoScroll} />
            </>
          )}
        </div>
      </div>
      <ReelFeed
        key={order}
        initialItems={initialItems}
        initialCursor={initialCursor}
        order={order}
        autoScroll={autoScroll}
        videoOnly={videoOnly}
        collections={collections}
        onOrderBarVisibility={onPausedChromeVisibility}
        onUserPaused={setUserPaused}
      />
    </div>
  );
}
