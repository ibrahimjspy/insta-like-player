"use client";

import { Ban, ExternalLink, Heart, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { deleteReel, skipReel } from "@/app/actions";
import { CollectionAddButton, type CollectionOption } from "@/components/CollectionAddButton";
import { FavoriteButtonUI, useFavorite } from "@/components/FavoriteButton";
import { useFeedActiveSlide, useOnReelActivated } from "@/components/reel-feed/useFeedActiveSlide";
import { useReelWatchMetrics } from "@/components/reel-feed/useReelWatchMetrics";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  buildFeedFetchUrl,
  nextFeedPaginationState,
  shouldLoadMoreFeed,
  trackRecentReelId,
  withFeedKeys,
  type FeedItem,
} from "@/lib/feed/feed-pagination";
import { PlatformBadge } from "@/components/PlatformBadge";
import { openOnPlatformLabel } from "@/lib/platforms";
import { type ReelView, videoSrc } from "@/lib/types";

type FeedOrder = "recent" | "oldest" | "random";

const P = FEED_TASTE_CONFIG.player;

function initialFeedState(reels: ReelView[]) {
  const items = withFeedKeys(reels);
  return { items, activeReelId: items[0]?.feedKey ?? null };
}

interface Props {
  initialItems: ReelView[];
  initialCursor: string | null;
  order: FeedOrder;
  paginate?: boolean;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
  onOrderBarVisibility?: (visible: boolean) => void;
  onUserPaused?: (paused: boolean) => void;
  autoScroll?: boolean;
  videoOnly?: boolean;
  collections?: CollectionOption[];
}

export function ReelFeed({
  initialItems,
  initialCursor,
  order,
  paginate = true,
  emptyTitle,
  emptyHint,
  onOrderBarVisibility,
  onUserPaused: onUserPausedChange,
  autoScroll = false,
  videoOnly = false,
  collections,
}: Props) {
  const [feedInit] = useState(() => initialFeedState(initialItems));
  const [items, setItems] = useState<FeedItem[]>(feedInit.items);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [randomExhausted, setRandomExhausted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(feedInit.activeReelId);
  const [userPaused, setUserPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartIndex = useRef<number | null>(null);
  const isSnapping = useRef(false);
  const loadingRef = useRef(false);
  const recentReelIds = useRef<string[]>([]);

  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(P.muteStorageKey) === "true";
  });

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(P.muteStorageKey, String(next));
      return next;
    });
  }, []);

  const onActiveChange = useCallback((nextId: string | null) => {
    setActiveReelId((prev) => nextId ?? prev);
  }, []);

  useFeedActiveSlide(feedRef, items.length, onActiveChange);

  useOnReelActivated(activeReelId, () => {
    setUserPaused(false);
    onUserPausedChange?.(false);
  });

  useEffect(() => {
    onOrderBarVisibility?.(activeReelId !== null && userPaused);
  }, [activeReelId, userPaused, onOrderBarVisibility]);

  useEffect(() => {
    if (items.length === 0) onOrderBarVisibility?.(true);
  }, [items.length, onOrderBarVisibility]);

  const slideHeight = useCallback(() => feedRef.current?.clientHeight ?? 0, []);

  const slideCount = useCallback(() => {
    const root = feedRef.current;
    return root?.querySelectorAll("[data-reel-slide]").length ?? 0;
  }, []);

  const scrollToSlide = useCallback(
    (index: number) => {
      const root = feedRef.current;
      const h = slideHeight();
      if (!root || h <= 0) return;
      const max = Math.max(0, slideCount() - 1);
      const clamped = Math.min(max, Math.max(0, index));
      isSnapping.current = true;
      root.scrollTo({ top: clamped * h, behavior: "instant" });
      requestAnimationFrame(() => {
        isSnapping.current = false;
      });
    },
    [slideHeight, slideCount],
  );

  const snapToNearestSlide = useCallback(() => {
    const root = feedRef.current;
    const h = slideHeight();
    if (!root || h <= 0 || isSnapping.current) return;
    const target = Math.round(root.scrollTop / h);
    if (Math.abs(root.scrollTop - target * h) > 2) scrollToSlide(target);
  }, [slideHeight, scrollToSlide]);

  const clampScrollToOneStep = useCallback(() => {
    if (isSnapping.current || touchStartIndex.current === null) return;
    const root = feedRef.current;
    const h = slideHeight();
    if (!root || h <= 0) return;
    const current = Math.round(root.scrollTop / h);
    const delta = current - touchStartIndex.current;
    if (Math.abs(delta) > 1) {
      scrollToSlide(touchStartIndex.current + Math.sign(delta));
    }
  }, [slideHeight, scrollToSlide]);

  const onFeedScroll = useCallback(() => {
    if (!isSnapping.current) clampScrollToOneStep();
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(snapToNearestSlide, P.scrollSettleMs);
  }, [clampScrollToOneStep, snapToNearestSlide]);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;

    const onPointerDown = (e: PointerEvent) => {
      const h = root.clientHeight;
      if (h <= 0) return;
      if (e.pointerType === "touch" || e.pointerType === "pen") {
        touchStartIndex.current = Math.round(root.scrollTop / h);
      }
    };

    const onScrollEnd = () => {
      touchStartIndex.current = null;
      snapToNearestSlide();
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("scrollend", onScrollEnd);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("scrollend", onScrollEnd);
    };
  }, [snapToNearestSlide]);

  useEffect(() => {
    return () => {
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!activeReelId) return;
    const reel = items.find((r) => r.feedKey === activeReelId);
    if (!reel) return;
    recentReelIds.current = trackRecentReelId(recentReelIds.current, reel.id);
  }, [activeReelId, items]);

  const hasMore = shouldLoadMoreFeed({
    paginate,
    order,
    cursor,
    randomExhausted,
  });

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const url = buildFeedFetchUrl({
        order,
        cursor,
        excludeReelIds: recentReelIds.current,
      });
      const res = await fetch(url);
      const page = (await res.json()) as { items: ReelView[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...withFeedKeys(page.items, prev.length)]);
      const next = nextFeedPaginationState({
        order,
        cursor,
        randomExhausted,
        page,
      });
      setCursor(next.cursor);
      setRandomExhausted(next.randomExhausted);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, order, cursor, randomExhausted]);

  const removeItem = useCallback((feedKey: string) => {
    setItems((prev) => prev.filter((r) => r.feedKey !== feedKey));
  }, []);

  const onDelete = useCallback(
    (feedKey: string, reelId: string) => {
      removeItem(feedKey);
      deleteReel(reelId).catch(() => undefined);
    },
    [removeItem],
  );

  const onSkip = useCallback(
    (feedKey: string, reelId: string) => {
      removeItem(feedKey);
      skipReel(reelId).catch(() => undefined);
    },
    [removeItem],
  );

  const onUserPaused = useCallback(
    (paused: boolean) => {
      setUserPaused(paused);
      onUserPausedChange?.(paused);
    },
    [onUserPausedChange],
  );

  const activeIndex = useMemo(
    () => (activeReelId ? items.findIndex((r) => r.feedKey === activeReelId) : -1),
    [items, activeReelId],
  );

  const advanceToNextSlide = useCallback(() => {
    if (activeIndex < 0 || activeIndex >= items.length - 1) return;
    scrollToSlide(activeIndex + 1);
    setUserPaused(false);
    onUserPausedChange?.(false);
  }, [activeIndex, items.length, scrollToSlide, onUserPausedChange]);

  if (items.length === 0) {
    return <EmptyFeed title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div
      ref={feedRef}
      className="feed-snap no-scrollbar h-full overflow-x-hidden overflow-y-scroll bg-black"
      onScroll={onFeedScroll}
    >
      {items.map((reel, index) => {
        const isNearActive =
          activeIndex >= 0 && Math.abs(index - activeIndex) <= 1;
        const showChrome = !videoOnly || (userPaused && activeReelId === reel.feedKey);
        return (
          <ReelSlide
            key={reel.feedKey}
            reel={reel}
            isActive={activeReelId === reel.feedKey}
            isNearActive={isNearActive}
            scrollRoot={feedRef}
            muted={muted}
            onToggleMute={toggleMute}
            onDelete={onDelete}
            onSkip={onSkip}
            onUserPaused={onUserPaused}
            autoScroll={autoScroll}
            showChrome={showChrome}
            collections={collections}
            onAutoScrollAdvance={advanceToNextSlide}
          />
        );
      })}
      <Sentinel onVisible={loadMore} enabled={hasMore} loading={loading} />
    </div>
  );
}

function ReelSlide({
  reel,
  isActive,
  isNearActive,
  scrollRoot,
  muted,
  onToggleMute,
  onDelete,
  onSkip,
  onUserPaused,
  autoScroll,
  showChrome = true,
  collections,
  onAutoScrollAdvance,
}: {
  reel: FeedItem;
  isActive: boolean;
  isNearActive: boolean;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  muted: boolean;
  onToggleMute: () => void;
  onDelete: (feedKey: string, reelId: string) => void;
  onSkip: (feedKey: string, reelId: string) => void;
  onUserPaused?: (paused: boolean) => void;
  autoScroll?: boolean;
  showChrome?: boolean;
  collections?: CollectionOption[];
  onAutoScrollAdvance?: () => void;
}) {
  const attachVideo = useVideoPreload(scrollRoot, reel.feedKey, isActive || isNearActive);
  const { videoRef, recordSessionStart } = useReelWatchMetrics({
    reelId: reel.id,
    durationSec: reel.durationSec,
    isActive,
    attachVideo,
    autoScroll: autoScroll ?? false,
    onAutoScrollAdvance,
  });

  const [likeBurst, setLikeBurst] = useState<{ x: number; y: number; key: number } | null>(
    null,
  );
  const [frameReady, setFrameReady] = useState(false);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fav, toggle: toggleFav, like, pending: favoritePending } = useFavorite(
    reel.id,
    reel.isFavorite,
  );

  const showVideo = frameReady && (isActive || isNearActive);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, videoRef]);

  const primeFirstFrame = useCallback((el: HTMLVideoElement) => {
    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const wasMuted = el.muted;
    el.muted = true;
    el.currentTime = 0;
    void el
      .play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = wasMuted;
        setFrameReady(true);
      })
      .catch(() => {
        el.muted = wasMuted;
        setFrameReady(true);
      });
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attachVideo) return;
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) primeFirstFrame(el);
  }, [attachVideo, primeFirstFrame, videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attachVideo) return;
    el.preload = "auto";
    if (el.readyState === HTMLMediaElement.HAVE_NOTHING) el.load();
  }, [attachVideo, reel.feedKey, videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isActive || !frameReady) return;
    el.muted = muted;
    void el
      .play()
      .catch(() => {
        el.muted = true;
        return el.play();
      })
      .catch(() => undefined);
    recordSessionStart();
  }, [isActive, muted, frameReady, recordSessionStart, videoRef]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el || !isActive) return;
    if (el.paused) {
      el.play().catch(() => undefined);
      onUserPaused?.(false);
    } else {
      el.pause();
      onUserPaused?.(true);
    }
  };

  const onVideoTap = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const now = Date.now();
    const sinceLast = now - lastTapAt.current;
    lastTapAt.current = now;

    if (sinceLast > 0 && sinceLast < P.doubleTapMs) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      const root = e.currentTarget.closest("section");
      const rect = root?.getBoundingClientRect();
      setLikeBurst({
        x: e.clientX - (rect?.left ?? 0),
        y: e.clientY - (rect?.top ?? 0),
        key: Date.now(),
      });
      like();
      return;
    }

    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      togglePlay();
    }, P.doubleTapMs);
  };

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!likeBurst) return;
    const t = setTimeout(() => setLikeBurst(null), P.likeBurstDurationMs);
    return () => clearTimeout(t);
  }, [likeBurst]);

  return (
    <section
      data-reel-slide
      data-reel-id={reel.feedKey}
      className="feed-snap-slide relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden bg-black"
    >
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <video
          key={reel.feedKey}
          ref={videoRef}
          src={attachVideo ? videoSrc(reel.platform, reel.shortcode) : undefined}
          className={`max-h-full max-w-full object-contain object-center ${
            showVideo ? "opacity-100" : "opacity-0"
          }`}
          loop
          playsInline
          preload={attachVideo ? "auto" : "none"}
          onLoadedData={() => {
            const el = videoRef.current;
            if (el) primeFirstFrame(el);
          }}
          onPointerUp={onVideoTap}
        />
      </div>

      {likeBurst && (
        <div
          key={likeBurst.key}
          className="pointer-events-none absolute z-30"
          style={{ left: likeBurst.x, top: likeBurst.y, transform: "translate(-50%, -50%)" }}
        >
          <Heart
            size={88}
            fill="currentColor"
            strokeWidth={0}
            className="like-burst text-like drop-shadow-lg"
          />
        </div>
      )}

      <div className="absolute right-3 bottom-4 z-20 flex flex-col items-center gap-4 md:bottom-12">
        {showChrome && (
          <>
            <FavoriteButtonUI fav={fav} onToggle={toggleFav} pending={favoritePending} />
            {collections && collections.length > 0 && (
              <CollectionAddButton reelId={reel.id} collections={collections} />
            )}
            <RailButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
              {muted ? <VolumeX size={26} /> : <Volume2 size={26} />}
            </RailButton>
            <a
              href={reel.reelUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={openOnPlatformLabel(reel.platform)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="grid place-items-center text-white/90 transition-transform active:scale-90 hover:text-white"
            >
              <ExternalLink size={24} />
            </a>
            <RailButton
              label="Don't import (hide and never re-download)"
              onClick={() => onSkip(reel.feedKey, reel.id)}
            >
              <Ban size={24} />
            </RailButton>
            <RailButton
              label="Delete reel"
              onClick={() => {
                if (confirm("Delete this reel and its downloaded video?"))
                  onDelete(reel.feedKey, reel.id);
              }}
              className="hover:text-red-500"
            >
              <Trash2 size={24} />
            </RailButton>
          </>
        )}
      </div>

      {showChrome && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pb-4">
          {reel.creator && (
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <PlatformBadge platform={reel.creator.platform} />
              @{reel.creator.username}
            </p>
          )}
          {reel.caption && (
            <p className="mt-1 line-clamp-3 max-w-2xl text-sm text-white/80">{reel.caption}</p>
          )}
        </div>
      )}
    </section>
  );
}

/** Lazy-attach video when slide is near the viewport. */
function useVideoPreload(
  scrollRoot: React.RefObject<HTMLDivElement | null>,
  feedKey: string,
  enabled: boolean,
) {
  const [lazyLoaded, setLazyLoaded] = useState(false);

  useEffect(() => {
    if (enabled) return;
    const section = document.querySelector(`[data-reel-id="${feedKey}"]`);
    if (!section) return;

    let loader: IntersectionObserver | null = null;
    let cancelled = false;

    const attach = () => {
      if (cancelled) return;
      const root = scrollRoot.current;
      if (!root) {
        requestAnimationFrame(attach);
        return;
      }
      loader = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setLazyLoaded(true);
        },
        { root, rootMargin: P.videoPreloadRootMargin, threshold: 0 },
      );
      loader.observe(section);
    };

    attach();
    return () => {
      cancelled = true;
      loader?.disconnect();
    };
  }, [scrollRoot, feedKey, enabled]);

  return enabled || lazyLoaded;
}

function RailButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`grid place-items-center text-white/90 transition-transform active:scale-90 hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}

function Sentinel({
  onVisible,
  enabled,
  loading,
}: {
  onVisible: () => void;
  enabled: boolean;
  loading: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loading) onVisible();
      },
      { rootMargin: P.sentinelRootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, enabled, loading]);

  return (
    <div ref={ref} className="grid h-12 shrink-0 place-items-center text-sm text-white/50">
      {loading ? "Loading…" : enabled ? "" : "You're all caught up"}
    </div>
  );
}

function EmptyFeed({ title, hint }: { title?: string; hint?: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center bg-black p-8 text-center">
      <div className="max-w-md">
        <h2 className="text-xl font-semibold text-white">{title ?? "No reels to play yet"}</h2>
        <p className="mt-2 text-sm text-white/70">
          {hint ?? (
            <>
              Import your Instagram likes export and download the media from the{" "}
              <a
                href="/admin"
                className="font-medium text-foreground-secondary underline underline-offset-2 hover:text-foreground"
              >
                Admin
              </a>{" "}
              page to start building your library.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
