"use client";

import { Ban, ExternalLink, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { deleteReel, skipReel } from "@/app/actions";
import { CollectionAddButton, type CollectionOption } from "@/components/CollectionAddButton";
import { FavoriteButtonUI, useFavorite } from "@/components/FavoriteButton";
import { OfflineCachedBadge } from "@/components/OfflineCachedBadge";
import { useOfflineOptional } from "@/components/OfflineProvider";
import { OfflineTakeButton } from "@/components/OfflineTakeButton";
import { PlatformBadge } from "@/components/PlatformBadge";
import { startPlayback } from "@/components/reel-feed/playback";
import { SeekFeedback, type SeekDirection } from "@/components/reel-feed/SeekFeedback";
import { VideoScrubber } from "@/components/reel-feed/VideoScrubber";
import {
  classifyTapZone,
  clampSeekTime,
} from "@/components/reel-feed/player-gestures";
import { useFeedActiveSlide, useOnReelActivated } from "@/components/reel-feed/useFeedActiveSlide";
import { useReelWatchMetrics } from "@/components/reel-feed/useReelWatchMetrics";
import { rankAutoQueue, readInterest } from "@/lib/feed/auto-ranking";
import { readPosition, savePosition } from "@/lib/feed/player-state";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  buildFeedFetchUrl,
  nextFeedPaginationState,
  shouldLoadMoreFeed,
  trackRecentReelId,
  withFeedKeys,
  type FeedItem,
} from "@/lib/feed/feed-pagination";
import { openOnPlatformLabel } from "@/lib/platforms";
import { type ReelView, videoSrc } from "@/lib/types";

type FeedOrder = "recent" | "oldest" | "random";

const P = FEED_TASTE_CONFIG.player;

function initialFeedState(reels: ReelView[]) {
  const items = withFeedKeys(reels);
  return { items, activeReelId: items[0]?.feedKey ?? null };
}

interface Props {
  resumeKey?: string;
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
  /// Override media URL (e.g. IndexedDB blob URLs for the offline pocket).
  resolveVideoSrc?: (reel: ReelView) => string;
  /// Hide server-backed destructive actions (offline pocket).
  localOnly?: boolean;
}

export function ReelFeed({
  initialItems,
  resumeKey,
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
  resolveVideoSrc,
  localOnly = false,
}: Props) {
  const [resume] = useState(() => resumeKey ? readPosition(resumeKey) : null);
  const [feedInit] = useState(() => {
    const state = initialFeedState(initialItems);
    state.activeReelId = state.items.find((item) => item.id === resume?.reelId)?.feedKey ?? state.activeReelId;
    return state;
  });
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

  useLayoutEffect(() => {
    const root = feedRef.current;
    const index = feedInit.items.findIndex((item) => item.feedKey === feedInit.activeReelId);
    if (root && index > 0) root.scrollTop = index * root.clientHeight;
  }, [feedInit]);

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
      if (!res.ok) throw new Error("Unable to load more videos");
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
    } catch (error) {
      console.warn("Feed pagination unavailable", error);
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
    if (activeIndex < 0) return;
    const next = activeIndex + 1;
    if (next >= items.length) {
      if (hasMore) {
        void loadMore();
      } else {
        feedRef.current?.querySelector<HTMLVideoElement>("[data-active-reel] video")?.pause();
        setUserPaused(true);
        onUserPausedChange?.(true);
      }
      return;
    }
    scrollToSlide(next);
    setUserPaused(false);
    onUserPausedChange?.(false);
  }, [activeIndex, items, hasMore, loadMore, scrollToSlide, onUserPausedChange]);

  useEffect(() => {
    if (!autoScroll || order !== "random") return;
    const frame = requestAnimationFrame(() => {
      const interest = readInterest();
      setItems((current) => rankAutoQueue(current, activeReelId, order, autoScroll, interest));
    });
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, order, activeReelId, items.length]);

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
        const liftChrome = userPaused && activeReelId === reel.feedKey;
        return (
          <ReelSlide
            key={reel.feedKey}
            reel={reel}
            resumeKey={resumeKey}
            initialTime={reel.feedKey === feedInit.activeReelId && reel.id === resume?.reelId ? resume.time : 0}
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
            liftChrome={liftChrome}
            collections={collections}
            onAutoScrollAdvance={advanceToNextSlide}
            resolveVideoSrc={resolveVideoSrc}
            localOnly={localOnly}
          />
        );
      })}
      <Sentinel onVisible={loadMore} enabled={hasMore} loading={loading} />
    </div>
  );
}

function ReelSlide({
  reel,
  resumeKey,
  initialTime,
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
  liftChrome = false,
  collections,
  onAutoScrollAdvance,
  resolveVideoSrc,
  localOnly = false,
}: {
  reel: FeedItem;
  resumeKey?: string;
  initialTime: number;
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
  liftChrome?: boolean;
  collections?: CollectionOption[];
  onAutoScrollAdvance?: () => void;
  resolveVideoSrc?: (reel: ReelView) => string;
  localOnly?: boolean;
}) {
  const mediaSrc = resolveVideoSrc?.(reel) ?? videoSrc(reel.platform, reel.shortcode);
  const offline = useOfflineOptional();
  const isCached = !localOnly && (offline?.isCached(reel.id) ?? false);
  const attachVideo = useVideoPreload(scrollRoot, reel.feedKey, isActive || isNearActive);
  const { videoRef, recordSessionStart } = useReelWatchMetrics({
    reelId: reel.id,
    durationSec: reel.durationSec,
    isActive,
    attachVideo,
    autoScroll: autoScroll ?? false,
    persistEnabled: !localOnly,
    onAutoScrollAdvance,
  });

  const [seekBurst, setSeekBurst] = useState<{
    direction: SeekDirection;
    key: number;
  } | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [actualMuted, setActualMuted] = useState(muted);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fav, toggle: toggleFav, pending: favoritePending } = useFavorite(
    reel.id,
    reel.isFavorite,
  );

  const showVideo = frameReady && (isActive || isNearActive);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, videoRef]);

  const restoredTime = useRef(false);
  const primeFirstFrame = useCallback((el: HTMLVideoElement) => {
    if (!restoredTime.current) {
      el.currentTime = Number.isFinite(el.duration)
        ? Math.min(initialTime, Math.max(0, el.duration - 0.1)) : initialTime;
      restoredTime.current = true;
    }
    setFrameReady(true);
  }, [initialTime]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isActive || !resumeKey || !attachVideo) return;
    let resumeOnVisible = false;
    const save = () => {
      if (restoredTime.current) savePosition(resumeKey, { reelId: reel.id, time: el.currentTime });
    };
    const visibilityChanged = () => {
      save();
      if (document.hidden) {
        resumeOnVisible = !el.paused;
        el.pause();
      } else if (resumeOnVisible) {
        resumeOnVisible = false;
        void el.play().catch(() => onUserPaused?.(true));
      }
    };
    el.addEventListener("timeupdate", save);
    el.addEventListener("pause", save);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      save();
      el.removeEventListener("timeupdate", save);
      el.removeEventListener("pause", save);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [isActive, attachVideo, resumeKey, reel.id, videoRef, onUserPaused]);

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
    if (document.hidden) return;
    let cancelled = false;
    void startPlayback(el, muted, () => !cancelled && !document.hidden)
      .then((started) => { if (started) recordSessionStart(); })
      .catch(() => { if (!cancelled) onUserPaused?.(true); });
    return () => { cancelled = true; };
  }, [isActive, muted, frameReady, recordSessionStart, videoRef, onUserPaused]);

  const enableSound = () => {
    const el = videoRef.current;
    if (!el || !isActive) return;
    // Unmute and play synchronously within the tap, before awaiting anything.
    el.muted = false;
    void el.play().catch(() => {
      el.muted = true;
      onUserPaused?.(true);
    });
    if (muted) onToggleMute();
  };

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

  const seekBy = useCallback(
    (direction: SeekDirection) => {
      const el = videoRef.current;
      if (!el || !isActive) return;
      const delta = direction === "back" ? -P.seekSeconds : P.seekSeconds;
      const next = clampSeekTime(el.currentTime, delta, el.duration);
      if (next === null) return;
      el.currentTime = next;
      setSeekBurst({ direction, key: Date.now() });
    },
    [isActive, videoRef],
  );

  const onVideoTap = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current?.muted && !muted) {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      lastTapAt.current = 0;
      enableSound();
      return;
    }

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
      const zone = classifyTapZone(
        e.clientX,
        rect?.left ?? 0,
        rect?.width ?? 0,
        P.seekSideRatio,
      );
      // Netflix halves: left = back, right = forward (midpoint counts as forward).
      seekBy(zone === "back" ? "back" : "forward");
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
    if (!seekBurst) return;
    const t = setTimeout(() => setSeekBurst(null), P.seekFeedbackMs);
    return () => clearTimeout(t);
  }, [seekBurst]);

  return (
    <section
      data-reel-slide
      data-active-reel={isActive ? "true" : undefined}
      data-reel-id={reel.feedKey}
      className="feed-snap-slide relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden bg-black"
    >
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <video
          key={reel.feedKey}
          ref={videoRef}
          src={attachVideo ? mediaSrc : undefined}
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
          onVolumeChange={(event) => setActualMuted(event.currentTarget.muted)}
          onPlay={() => { if (isActive) onUserPaused?.(false); }}
          onPointerUp={onVideoTap}
        />
      </div>

      {isActive && actualMuted && !muted && !showChrome && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); enableSound(); }}
          aria-label="Turn sound on"
          title="Turn sound on"
          className="absolute bottom-[calc(1.75rem+env(safe-area-inset-bottom))] right-3 z-30 grid size-11 place-items-center rounded-full bg-black/35 text-white/90 shadow-lg backdrop-blur-md"
        >
          <VolumeX size={20} />
        </button>
      )}

      {seekBurst && (
        <SeekFeedback
          direction={seekBurst.direction}
          seconds={P.seekSeconds}
          burstKey={seekBurst.key}
        />
      )}

      {isActive && liftChrome && <VideoScrubber videoRef={videoRef} lifted />}

      <div
        className={`absolute right-3 z-20 flex flex-col items-center gap-3 transition-[bottom,opacity] duration-200 ${
          liftChrome
            ? "bottom-[calc(6.25rem+env(safe-area-inset-bottom))]"
            : "bottom-7 md:bottom-12"
        }`}
      >
        {showChrome && (
          <>
            {!localOnly && (
              <FavoriteButtonUI
                fav={fav}
                onToggle={toggleFav}
                pending={favoritePending}
                className="size-10 rounded-full bg-black/25 shadow-lg shadow-black/25 backdrop-blur-md hover:bg-black/35"
              />
            )}
            {!localOnly && (
              <OfflineTakeButton
                reel={reel}
                className="size-10 rounded-full bg-black/25 shadow-lg shadow-black/25 backdrop-blur-md hover:bg-black/35"
              />
            )}
            {!localOnly && collections && collections.length > 0 && (
              <CollectionAddButton
                reelId={reel.id}
                collections={collections}
                className="size-10 rounded-full bg-black/25 shadow-lg shadow-black/25 backdrop-blur-md hover:bg-black/35"
              />
            )}
            <RailButton label={actualMuted ? "Unmute" : "Mute"} onClick={actualMuted ? enableSound : onToggleMute}>
              {actualMuted ? <VolumeX size={26} /> : <Volume2 size={26} />}
            </RailButton>
            {!localOnly && (
              <>
                <a
                  href={reel.reelUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={openOnPlatformLabel(reel.platform)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="grid size-10 place-items-center rounded-full bg-black/25 text-white/90 shadow-lg shadow-black/25 backdrop-blur-md transition-transform active:scale-90 hover:bg-black/35 hover:text-white"
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
          </>
        )}
      </div>

      {showChrome && (
        <div
          className={`pointer-events-none absolute inset-x-0 z-10 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pt-20 transition-[bottom,padding] duration-200 ${
          liftChrome
            ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] pb-3"
            : "bottom-0 pb-4"
          }`}
        >
          {reel.creator && (
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <PlatformBadge platform={reel.creator.platform} />
              {isCached && <OfflineCachedBadge />}
              @{reel.creator.username}
            </p>
          )}
          {!reel.creator && isCached && (
            <p className="mb-1">
              <OfflineCachedBadge />
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
      className={`grid size-10 place-items-center rounded-full bg-black/25 text-white/90 shadow-lg shadow-black/25 backdrop-blur-md transition-transform active:scale-90 hover:bg-black/35 hover:text-white ${className}`}
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
