"use client";

import { CloudOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AutoScrollToggle } from "@/components/AutoScrollToggle";
import { type CollectionOption } from "@/components/CollectionAddButton";
import { useOffline } from "@/components/OfflineProvider";
import { OrderSelect } from "@/components/OrderSelect";
import { useReaderChrome } from "@/components/ReaderChromeContext";
import { ReelFeed } from "@/components/ReelFeed";
import { VideoOnlyToggle } from "@/components/VideoOnlyToggle";
import { readPosition } from "@/lib/feed/player-state";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  createBlobUrlMap,
  listOfflineReels,
  OFFLINE_CHANGED_EVENT,
  offlineRecordsToViews,
  orderOfflineReels,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderParam = searchParams.get("order");
  const order: FeedOrder =
    orderParam && ORDERS.includes(orderParam as FeedOrder)
      ? (orderParam as FeedOrder)
      : "recent";
  const [orderReady, setOrderReady] = useState(false);
  const { setFeedPausedChrome } = useReaderChrome();
  const { hostReachable, markHostUnavailable, probeHost } = useOffline();
  const [mode, setMode] = useState<FeedMode>("loading");
  const [items, setItems] = useState<ReelView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loadedOrder, setLoadedOrder] = useState<FeedOrder>(order);
  const [localOrder, setLocalOrder] = useState<FeedOrder>(order);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const randomSeedRef = useRef<number | null>(null);
  const [showOrderBar, setShowOrderBar] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [videoOnly, setVideoOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(FEED_TASTE_CONFIG.player.videoOnlyStorageKey) === "true";
  });
  const selectedOrder = hostReachable === false ? localOrder : order;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("ilp_last_order"); } catch { /* Storage unavailable. */ }
      if (!orderParam && saved && ORDERS.includes(saved as FeedOrder)) {
        setLocalOrder(saved as FeedOrder);
        router.replace(`/?order=${saved}`);
      }
      setOrderReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [orderParam, router]);

  useEffect(() => {
    if (!orderReady || !orderParam) return;
    try { localStorage.setItem("ilp_last_order", order); } catch { /* Storage unavailable. */ }
  }, [order, orderParam, orderReady]);

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
    if (hostReachable === null || !orderReady) return;
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
      if (randomSeedRef.current === null) {
        try {
          const seed = Number(localStorage.getItem("ilp_shuffle_seed"));
          randomSeedRef.current = seed > 0 && Number.isFinite(seed) ? seed : Date.now();
          localStorage.setItem("ilp_shuffle_seed", String(randomSeedRef.current));
        } catch { randomSeedRef.current = Date.now(); }
      }
      const ordered = orderOfflineReels(
        records,
        selectedOrder,
        randomSeedRef.current,
      );
      const nextUrls = createBlobUrlMap(ordered);
      replaceBlobUrls(nextUrls);
      setLoadedOrder(selectedOrder);
      setItems(offlineRecordsToViews(ordered));
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
          fetch(`/api/reels?order=${selectedOrder}&resume=${encodeURIComponent(readPosition(`ilp_position_online_${selectedOrder}`)?.reelId ?? "")}`, {
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
        setLoadedOrder(selectedOrder);
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
  }, [hostReachable, markHostUnavailable, reloadVersion, selectedOrder, orderReady]);

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

  const offline = mode === "offline";
  const displayOrder = offline ? localOrder : order;

  const onOrderChange = useCallback(
    (next: FeedOrder) => {
      setLocalOrder(next);
      try { localStorage.setItem("ilp_last_order", next); } catch { /* Storage unavailable. */ }
      if (offline) {
        window.history.replaceState(null, "", `/?order=${next}`);
      } else {
        router.push(`/?order=${next}`);
      }
    },
    [offline, router],
  );

  const feedKey = useMemo(
    () => `${mode}-${loadedOrder}-${items.map((item) => item.id).join(",")}`,
    [mode, loadedOrder, items],
  );

  if (mode === "loading") {
    return (
      <div className="grid h-full place-items-center bg-black text-sm text-white/60">
        Loading feed…
      </div>
    );
  }

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
          <OrderSelect value={displayOrder} onChange={onOrderChange} />
          {offline && (
            <span
              className="inline-flex size-7 items-center justify-center rounded-full text-white/55"
              title="Using saved videos"
              aria-label="Using saved videos"
            >
              <CloudOff size={14} />
            </span>
          )}
          {userPaused && items.length > 0 && (
            <>
              <span className="mx-0.5 hidden h-6 w-px bg-white/10 sm:block" />
              <VideoOnlyToggle enabled={videoOnly} onChange={onVideoOnlyChange} />
              <AutoScrollToggle enabled={autoScroll} onChange={(enabled) => {
                if (enabled) {
                  const video = document.querySelector<HTMLVideoElement>("[data-active-reel] video");
                  // Keep play inside the tap gesture for mobile browser permission.
                  if (video) void video.play().catch(() => undefined);
                }
                setAutoScroll(enabled);
              }} />
            </>
          )}
        </div>
      </div>
      <ReelFeed
        key={feedKey}
        resumeKey={`ilp_position_${mode}_${loadedOrder}`}
        initialItems={items}
        initialCursor={cursor}
        order={loadedOrder}
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
