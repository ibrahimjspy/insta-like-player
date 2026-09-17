"use client";

import { CloudOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { AutoScrollToggle } from "@/components/AutoScrollToggle";
import { type CollectionOption } from "@/components/CollectionAddButton";
import { useOffline } from "@/components/OfflineProvider";
import { OrderSelect } from "@/components/OrderSelect";
import { useReaderChrome } from "@/components/ReaderChromeContext";
import { ReelFeed } from "@/components/ReelFeed";
import { VideoOnlyToggle } from "@/components/VideoOnlyToggle";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  LAST_ORDER_STORAGE_KEY,
  feedOrderPath,
  parseFeedOrder,
  resolveFeedOrder,
} from "@/lib/feed/order";
import {
  clearPosition,
  readPosition,
  setPositionWritesEnabled,
} from "@/lib/feed/player-state";
import { readWatchIndex } from "@/lib/feed/watch-index";
import {
  createBlobUrlMap,
  listOfflineReels,
  nextOfflineRandomPage,
  OFFLINE_CHANGED_EVENT,
  offlineRecordsToViews,
  orderOfflineReels,
  revokeBlobUrlMap,
  startWithResume,
} from "@/lib/offline";
import type { ReelView } from "@/lib/types";
import type { FeedOrder } from "@/lib/queries";

const LOCAL_PAGE = FEED_TASTE_CONFIG.exclude.localPageSize;

type FeedMode = "loading" | "online" | "offline";

type OnlineFeedResponse = {
  items: ReelView[];
  nextCursor: string | null;
};

function positionKey(mode: "online" | "offline", order: FeedOrder) {
  return `ilp_position_${mode}_${order}`;
}

function newShuffleSeed(): number {
  return Date.now();
}

export function FeedPageClient() {
  const searchParams = useSearchParams();
  const orderParam = searchParams.get("order");
  const [orderReady, setOrderReady] = useState(false);
  const { setFeedPausedChrome } = useReaderChrome();
  const { hostReachable, markHostUnavailable, probeHost } = useOffline();
  const [mode, setMode] = useState<FeedMode>("loading");
  const [items, setItems] = useState<ReelView[]>([]);
  const [localPool, setLocalPool] = useState<ReelView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
  const [reloadVersion, setReloadVersion] = useState(0);
  // Drive the tabs from React state. Syncing For you through Next searchParams
  // remounted the feed on Recent before the URL caught up.
  const [localOrder, setLocalOrder] = useState<FeedOrder>("recent");
  const [loadedOrder, setLoadedOrder] = useState<FeedOrder>("recent");
  const [feedGeneration, setFeedGeneration] = useState(0);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const randomSeedRef = useRef<number | null>(null);
  const skipResumeRef = useRef(false);
  const [showOrderBar, setShowOrderBar] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [videoOnly, setVideoOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(FEED_TASTE_CONFIG.player.videoOnlyStorageKey) === "true";
  });

  useEffect(() => {
    if (orderReady) return;
    const frame = requestAnimationFrame(() => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(LAST_ORDER_STORAGE_KEY); } catch { /* Storage unavailable. */ }
      const resolved = resolveFeedOrder(orderParam, saved);
      setLocalOrder(resolved);
      if (!parseFeedOrder(orderParam)) {
        window.history.replaceState(null, "", feedOrderPath(resolved));
      }
      setOrderReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [orderParam, orderReady]);

  useEffect(() => {
    if (!orderReady) return;
    try { localStorage.setItem(LAST_ORDER_STORAGE_KEY, localOrder); } catch { /* Storage unavailable. */ }
  }, [localOrder, orderReady]);

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
    const skipResume = skipResumeRef.current;

    const replaceBlobUrls = (next: Map<string, string>) => {
      revokeBlobUrlMap(blobUrlsRef.current);
      blobUrlsRef.current = next;
      setBlobUrls(next);
    };

    const finishLoad = (nextMode: Exclude<FeedMode, "loading">, nextOrder: FeedOrder) => {
      skipResumeRef.current = false;
      setLoadedOrder(nextOrder);
      setMode(nextMode);
      setFeedGeneration((generation) => generation + 1);
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
          randomSeedRef.current = seed > 0 && Number.isFinite(seed) ? seed : newShuffleSeed();
          localStorage.setItem("ilp_shuffle_seed", String(randomSeedRef.current));
        } catch { randomSeedRef.current = newShuffleSeed(); }
      }
      const seed = randomSeedRef.current ?? newShuffleSeed();
      randomSeedRef.current = seed;
      const watchIndex = readWatchIndex();
      let ordered = offlineRecordsToViews(
        orderOfflineReels(records, localOrder, seed, watchIndex),
      );
      const resumeId = skipResume
        ? null
        : readPosition(positionKey("offline", localOrder))?.reelId ?? null;
      if (localOrder === "random") {
        ordered = startWithResume(ordered, resumeId);
        setLocalPool(ordered);
        setItems(ordered.slice(0, LOCAL_PAGE));
        setCursor("more");
      } else {
        setLocalPool([]);
        setItems(ordered);
        setCursor(null);
      }
      const nextUrls = createBlobUrlMap(records);
      replaceBlobUrls(nextUrls);
      setCollections([]);
      finishLoad("offline", localOrder);
    };

    const load = async () => {
      if (!hostReachable) {
        await loadOffline();
        return;
      }

      try {
        const resumeId = skipResume
          ? ""
          : readPosition(positionKey("online", localOrder))?.reelId ?? "";
        const [feedResponse, collectionResponse] = await Promise.all([
          fetch(
            `/api/reels?order=${localOrder}&resume=${encodeURIComponent(resumeId)}`,
            {
              cache: "no-store",
              signal: controller.signal,
            },
          ),
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
        setLocalPool([]);
        setItems(feed.items);
        setCursor(feed.nextCursor);
        setCollections(nextCollections);
        finishLoad("online", localOrder);
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
  }, [hostReachable, markHostUnavailable, reloadVersion, localOrder, orderReady]);

  useLayoutEffect(() => {
    setPositionWritesEnabled(true);
  }, [feedGeneration]);

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

  const loadMoreOfflineRandom = useCallback(
    (excludeReelIds: string[]) =>
      nextOfflineRandomPage(
        localPool,
        excludeReelIds,
        newShuffleSeed(),
        readWatchIndex(),
        LOCAL_PAGE,
      ),
    [localPool],
  );

  const offline = mode === "offline";
  const positionMode = offline ? "offline" : "online";

  const onOrderChange = useCallback(
    (next: FeedOrder) => {
      setPositionWritesEnabled(false);
      skipResumeRef.current = true;
      clearPosition(positionKey(positionMode, next));
      setLocalOrder(next);
      try { localStorage.setItem(LAST_ORDER_STORAGE_KEY, next); } catch { /* Storage unavailable. */ }

      if (next === "random") {
        randomSeedRef.current = newShuffleSeed();
        try { localStorage.setItem("ilp_shuffle_seed", String(randomSeedRef.current)); } catch { /* Storage unavailable. */ }
      }

      window.history.replaceState(null, "", feedOrderPath(next));
      setReloadVersion((version) => version + 1);
    },
    [positionMode],
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
        className={`absolute inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-[opacity,transform] duration-200 ease-out ${
          showOrderBar
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0"
        }`}
        aria-hidden={!showOrderBar}
      >
        <div className="flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-1.5 rounded-[1.35rem] border border-white/10 bg-black/45 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <OrderSelect value={localOrder} onChange={onOrderChange} />
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
        key={`${mode}-${loadedOrder}-${feedGeneration}`}
        resumeKey={positionKey(positionMode, loadedOrder)}
        initialItems={items}
        initialCursor={cursor}
        order={loadedOrder}
        autoScroll={autoScroll}
        videoOnly={videoOnly}
        collections={offline ? undefined : collections}
        paginate={!offline}
        localOnly={offline}
        loadMoreItems={offline && loadedOrder === "random" ? loadMoreOfflineRandom : undefined}
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
