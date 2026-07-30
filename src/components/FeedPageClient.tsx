"use client";

import { CloudOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AutoScrollToggle } from "@/components/AutoScrollToggle";
import { type CollectionOption } from "@/components/CollectionAddButton";
import { useOffline } from "@/components/OfflineProvider";
import { OrderSelect } from "@/components/OrderSelect";
import { useReaderChrome } from "@/components/ReaderChromeContext";
import { ReelFeed } from "@/components/ReelFeed";
import { VideoOnlyToggle } from "@/components/VideoOnlyToggle";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  createBlobUrlMap,
  listOfflineReels,
  OFFLINE_CHANGED_EVENT,
  offlineRecordsToViews,
  revokeBlobUrlMap,
} from "@/lib/offline";
import type { ReelView } from "@/lib/types";
import type { FeedOrder } from "@/lib/queries";

const ORDERS: FeedOrder[] = ["recent", "oldest", "random"];

type FeedMode = "loading" | "online" | "offline";

type OnlineFeedResponse = {
  items: ReelView[];
  nextCursor: string | null;
};

export function FeedPageClient() {
  const searchParams = useSearchParams();
  const orderParam = searchParams.get("order");
  const order: FeedOrder =
    orderParam && ORDERS.includes(orderParam as FeedOrder)
      ? (orderParam as FeedOrder)
      : "recent";
  const { setFeedPausedChrome } = useReaderChrome();
  const { hostReachable, markHostUnavailable, probeHost } = useOffline();
  const [mode, setMode] = useState<FeedMode>("loading");
  const [items, setItems] = useState<ReelView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
  const [reloadVersion, setReloadVersion] = useState(0);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const [showOrderBar, setShowOrderBar] = useState(true);
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
    if (hostReachable === null) void probeHost();
  }, [hostReachable, probeHost]);

  useEffect(() => {
    const onOfflineChanged = () => setReloadVersion((v) => v + 1);
    window.addEventListener(OFFLINE_CHANGED_EVENT, onOfflineChanged);
    return () => window.removeEventListener(OFFLINE_CHANGED_EVENT, onOfflineChanged);
  }, []);

  useEffect(() => {
    if (hostReachable === null) return;
    let cancelled = false;
    const controller = new AbortController();

    const replaceBlobUrls = (next: Map<string, string>) => {
      revokeBlobUrlMap(blobUrlsRef.current);
      blobUrlsRef.current = next;
      setBlobUrls(next);
    };

    const loadOffline = async () => {
      const records = await listOfflineReels().catch((err) => {
        console.warn("Offline cache unavailable", err);
        return [];
      });
      if (cancelled) return;
      const nextUrls = createBlobUrlMap(records);
      replaceBlobUrls(nextUrls);
      setItems(offlineRecordsToViews(records));
      setCursor(null);
      setCollections([]);
      setMode("offline");
    };

    const load = async () => {
      if (!hostReachable) {
        await loadOffline();
        return;
      }

      try {
        const [feedResponse, collectionResponse] = await Promise.all([
          fetch(`/api/reels?order=${order}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/collections", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (!feedResponse.ok || !collectionResponse.ok) {
          throw new Error("Live feed unavailable");
        }
        const [feed, nextCollections] = (await Promise.all([
          feedResponse.json(),
          collectionResponse.json(),
        ])) as [OnlineFeedResponse, CollectionOption[]];
        if (cancelled) return;
        replaceBlobUrls(new Map());
        setItems(feed.items);
        setCursor(feed.nextCursor);
        setCollections(nextCollections);
        setMode("online");
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === "AbortError")) return;
        markHostUnavailable();
        await loadOffline();
      }
    };

    void load().catch((err) => {
      if (!cancelled) console.warn("Failed to initialize feed", err);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hostReachable, markHostUnavailable, order, reloadVersion]);

  useEffect(
    () => () => {
      revokeBlobUrlMap(blobUrlsRef.current);
      blobUrlsRef.current = new Map();
    },
    [],
  );

  const resolveVideoSrc = useCallback(
    (reel: ReelView) => blobUrls.get(reel.id) ?? "",
    [blobUrls],
  );

  const feedKey = useMemo(
    () => `${mode}-${order}-${items.map((item) => item.id).join(",")}`,
    [mode, order, items],
  );

  if (mode === "loading") {
    return (
      <div className="grid h-full place-items-center bg-black text-sm text-white/60">
        Loading feed…
      </div>
    );
  }

  const offline = mode === "offline";

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
          {offline ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/75">
              <CloudOff size={14} />
              Saved feed
            </span>
          ) : (
            <OrderSelect value={order} />
          )}
          {userPaused && items.length > 0 && (
            <>
              <span className="mx-0.5 hidden h-6 w-px bg-white/10 sm:block" />
              <VideoOnlyToggle enabled={videoOnly} onChange={onVideoOnlyChange} />
              <AutoScrollToggle enabled={autoScroll} onChange={setAutoScroll} />
            </>
          )}
        </div>
      </div>
      <ReelFeed
        key={feedKey}
        initialItems={items}
        initialCursor={cursor}
        order={order}
        autoScroll={autoScroll}
        videoOnly={videoOnly}
        collections={offline ? undefined : collections}
        paginate={!offline}
        localOnly={offline}
        resolveVideoSrc={offline ? resolveVideoSrc : undefined}
        emptyTitle={offline ? "No saved videos yet" : "No videos yet"}
        emptyHint={
          offline
            ? "Connect to your Mac once and refresh the phone pocket from Admin."
            : undefined
        }
        onOrderBarVisibility={onPausedChromeVisibility}
        onUserPaused={setUserPaused}
      />
    </div>
  );
}
