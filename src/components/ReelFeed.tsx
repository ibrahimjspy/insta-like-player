"use client";

import { Ban, ExternalLink, Heart, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { deleteReel, flushWatchTime, recordWatch, skipReel } from "@/app/actions";
import { FavoriteButtonUI, useFavorite } from "@/components/FavoriteButton";
import { type ReelView, videoSrc } from "@/lib/types";

type FeedOrder = "recent" | "oldest" | "random";

const MUTE_KEY = "ilp_muted";
const DOUBLE_TAP_MS = 320;
const SCROLL_SETTLE_MS = 120;
/// Full loop completions before auto-advancing to the next reel.
const AUTO_SCROLL_LOOPS = 2;
/// Slide must fill this much of the feed viewport to count as "on screen".
const ACTIVE_RATIO = 0.55;

/** Unique per feed row so random mode can repeat the same reel without React key clashes. */
type FeedItem = ReelView & { feedKey: string };

function withFeedKeys(reels: ReelView[], offset = 0): FeedItem[] {
  return reels.map((r, i) => ({
    ...r,
    feedKey: `${r.id}-${offset + i}`,
  }));
}

function initialFeedState(reels: ReelView[]) {
  const items = withFeedKeys(reels);
  return { items, activeReelId: items[0]?.feedKey ?? null };
}

interface Props {
  initialItems: ReelView[];
  initialCursor: string | null;
  order: FeedOrder;
  /// When false, the feed renders a fixed list (no infinite scroll fetch).
  paginate?: boolean;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
  /// Show the feed order bar (Recent / Oldest / Random) only when this is true.
  onOrderBarVisibility?: (visible: boolean) => void;
  onUserPaused?: (paused: boolean) => void;
  /// After this many loop completions on the active reel, scroll to the next slide.
  autoScroll?: boolean;
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
}: Props) {
  const [feedInit] = useState(() => initialFeedState(initialItems));
  const [items, setItems] = useState<FeedItem[]>(feedInit.items);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(feedInit.activeReelId);
  const [userPaused, setUserPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveReelId = useRef<string | null>(null);
  const touchStartIndex = useRef<number | null>(null);
  const isSnapping = useRef(false);
  /// Reel ids shown this session — keeps For you from immediately repeating.
  const recentReelIds = useRef<string[]>([]);

  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(MUTE_KEY) === "true";
  });

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTE_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    onOrderBarVisibility?.(activeReelId !== null && userPaused);
  }, [activeReelId, userPaused, onOrderBarVisibility]);

  const slideHeight = useCallback(() => feedRef.current?.clientHeight ?? 0, []);

  const slideCount = useCallback(() => {
    const root = feedRef.current;
    return root?.querySelectorAll("[data-reel-slide]").length ?? 0;
  }, []);

  /// Lock scroll to a single reel index (0-based).
  const scrollToSlide = useCallback((index: number) => {
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
  }, [slideHeight, slideCount]);

  const snapToNearestSlide = useCallback(() => {
    const root = feedRef.current;
    const h = slideHeight();
    if (!root || h <= 0 || isSnapping.current) return;
    const target = Math.round(root.scrollTop / h);
    if (Math.abs(root.scrollTop - target * h) > 2) scrollToSlide(target);
  }, [slideHeight, scrollToSlide]);

  /// During a touch fling, never advance more than one reel from where the finger went down.
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
    scrollEndTimer.current = setTimeout(() => {
      snapToNearestSlide();
    }, SCROLL_SETTLE_MS);
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

  /// Pick the slide with the largest visible area (relative to the feed scroller).
  useEffect(() => {
    const root = feedRef.current;
    if (!root || items.length === 0) return;

    const ratios = new Map<string, number>();

    const pickActive = (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.reelId;
        if (!id) continue;
        ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
      }
      let bestId: string | null = null;
      let bestRatio = 0;
      for (const [id, ratio] of ratios) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = id;
        }
      }
      const nextId = bestRatio >= ACTIVE_RATIO ? bestId : null;
      setActiveReelId((prev) => {
        const resolved = nextId ?? prev;
        if (resolved && resolved !== prevActiveReelId.current) {
          prevActiveReelId.current = resolved;
          setUserPaused(false);
          onUserPausedChange?.(false);
        }
        return resolved;
      });
    };

    const observer = new IntersectionObserver(pickActive, {
      root,
      threshold: [0, 0.25, 0.5, 0.75, 0.9, 1],
    });

    const observeSlides = () => {
      observer.disconnect();
      ratios.clear();
      root.querySelectorAll<HTMLElement>("[data-reel-slide]").forEach((el) => observer.observe(el));
    };

    observeSlides();
    const mo = new MutationObserver(observeSlides);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      observer.disconnect();
    };
  }, [items, onUserPausedChange]);

  useEffect(() => {
    if (!activeReelId) return;
    const reel = items.find((r) => r.feedKey === activeReelId);
    if (!reel) return;
    const prev = recentReelIds.current;
    if (prev[prev.length - 1] === reel.id) return;
    recentReelIds.current = [...prev.filter((id) => id !== reel.id), reel.id].slice(-48);
  }, [activeReelId, items]);

  const hasMore =
    paginate && (order === "random" ? items.length > 0 : cursor !== null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const exclude =
        order === "random" && recentReelIds.current.length > 0
          ? `&exclude=${encodeURIComponent(recentReelIds.current.join(","))}`
          : "";
      const url =
        order === "random"
          ? `/api/reels?order=random${exclude}`
          : `/api/reels?order=${order}&cursor=${encodeURIComponent(cursor ?? "")}`;
      const res = await fetch(url);
      const page = (await res.json()) as { items: ReelView[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...withFeedKeys(page.items, prev.length)]);
      if (order !== "random") setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, order, cursor]);

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

  const advanceToNextSlide = useCallback(() => {
    if (!activeReelId) return;
    const activeIndex = items.findIndex((r) => r.feedKey === activeReelId);
    if (activeIndex < 0 || activeIndex >= items.length - 1) return;
    scrollToSlide(activeIndex + 1);
    setUserPaused(false);
    onUserPausedChange?.(false);
  }, [activeReelId, items, scrollToSlide, onUserPausedChange]);

  if (items.length === 0) {
    onOrderBarVisibility?.(true);
    return <EmptyFeed title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div
      ref={feedRef}
      className="feed-snap no-scrollbar h-full overflow-x-hidden overflow-y-scroll bg-black"
      onScroll={onFeedScroll}
    >
      {items.map((reel, index) => {
        const activeIndex = activeReelId
          ? items.findIndex((r) => r.feedKey === activeReelId)
          : -1;
        const isNearActive =
          activeIndex >= 0 && Math.abs(index - activeIndex) <= 1;
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
  onAutoScrollAdvance?: () => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watched = useRef(false);
  const accumulatedWatchSec = useRef(0);
  const sessionLoops = useRef(0);
  const autoScrollLoops = useRef(0);
  const lastVideoTime = useRef(0);
  const lastLoopDetectTime = useRef(0);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fav, toggle: toggleFav, like, pending: favoritePending } = useFavorite(
    reel.id,
    reel.isFavorite,
  );
  const [likeBurst, setLikeBurst] = useState<{ x: number; y: number; key: number } | null>(
    null,
  );
  const [loadVideo, setLoadVideo] = useState(false);
  const [frameReady, setFrameReady] = useState(false);

  /// Preload active slide + immediate neighbors (Instagram-style).
  const attachVideo = loadVideo || isActive || isNearActive;
  /// Show decoded video pixels (not the separate .jpg thumb) when buffered.
  const showVideo = frameReady && (isActive || isNearActive);

  useEffect(() => {
    const section = sectionRef.current;
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
          if (entry.isIntersecting) setLoadVideo(true);
        },
        { root, rootMargin: "200% 0px", threshold: 0 },
      );
      loader.observe(section);
    };

    attach();
    return () => {
      cancelled = true;
      loader?.disconnect();
    };
  }, [scrollRoot, reel.feedKey]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const markFrameReady = useCallback(() => {
    setFrameReady(true);
  }, []);

  /// Decode frame 0 so the browser paints a real video frame (not poster/thumb art).
  const primeFirstFrame = useCallback(
    (el: HTMLVideoElement) => {
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
          markFrameReady();
        })
        .catch(() => {
          el.muted = wasMuted;
          markFrameReady();
        });
    },
    [markFrameReady],
  );

  const onFirstFrame = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    primeFirstFrame(el);
  }, [primeFirstFrame]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attachVideo) return;
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      primeFirstFrame(el);
    }
  }, [attachVideo, primeFirstFrame]);

  /// Buffer video in the background for the active slide and neighbors.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attachVideo) return;
    el.preload = "auto";
    if (el.readyState === HTMLMediaElement.HAVE_NOTHING) el.load();
  }, [attachVideo, reel.shortcode]);

  const playActive = useCallback(() => {
    const el = videoRef.current;
    if (!el || !isActive) return;
    el.muted = muted;
    void el
      .play()
      .catch(() => {
        el.muted = true;
        return el.play();
      })
      .catch(() => undefined);
    if (!watched.current) {
      watched.current = true;
      recordWatch(reel.id).catch(() => undefined);
    }
  }, [isActive, muted, reel.id]);

  const persistWatchTime = useCallback(() => {
    const sec = accumulatedWatchSec.current;
    const loops = sessionLoops.current;
    accumulatedWatchSec.current = 0;
    sessionLoops.current = 0;
    if (sec < 2 && loops === 0) return;
    const el = videoRef.current;
    flushWatchTime(reel.id, sec, el?.currentTime ?? 0, {
      durationSec: reel.durationSec,
      loopCount: loops,
    }).catch(() => undefined);
  }, [reel.id, reel.durationSec]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attachVideo) return;

    if (!isActive) {
      el.pause();
      lastVideoTime.current = 0;
      lastLoopDetectTime.current = 0;
      autoScrollLoops.current = 0;
      persistWatchTime();
      return;
    }
    autoScrollLoops.current = 0;
    if (frameReady) playActive();
  }, [isActive, attachVideo, frameReady, playActive, persistWatchTime]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isActive) return;

    const onTimeUpdate = () => {
      if (!el.paused) {
        const t = el.currentTime;
        if (lastVideoTime.current > 0 && t >= lastVideoTime.current) {
          accumulatedWatchSec.current += Math.min(t - lastVideoTime.current, 2);
        }
        lastVideoTime.current = t;
      }

      if (el.paused) return;
      const duration = el.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (
        lastLoopDetectTime.current > duration * 0.5 &&
        el.currentTime < duration * 0.15
      ) {
        sessionLoops.current += 1;
        if (autoScroll) {
          autoScrollLoops.current += 1;
          if (autoScrollLoops.current >= AUTO_SCROLL_LOOPS) {
            autoScrollLoops.current = 0;
            onAutoScrollAdvance?.();
          }
        }
      }
      lastLoopDetectTime.current = el.currentTime;
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [isActive, attachVideo, autoScroll, reel.feedKey, onAutoScrollAdvance]);

  /// Checkpoint long sessions so engagement data survives tab closes.
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      if (accumulatedWatchSec.current >= 12) persistWatchTime();
    }, 30_000);
    return () => clearInterval(id);
  }, [isActive, persistWatchTime]);

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

  const showLikeBurst = (clientX: number, clientY: number) => {
    const root = sectionRef.current;
    const rect = root?.getBoundingClientRect();
    const x = clientX - (rect?.left ?? 0);
    const y = clientY - (rect?.top ?? 0);
    setLikeBurst({ x, y, key: Date.now() });
  };

  const onVideoTap = (e: React.PointerEvent<HTMLVideoElement>) => {
    const now = Date.now();
    const sinceLast = now - lastTapAt.current;
    lastTapAt.current = now;

    if (sinceLast > 0 && sinceLast < DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      showLikeBurst(e.clientX, e.clientY);
      like();
      return;
    }

    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      togglePlay();
    }, DOUBLE_TAP_MS);
  };

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!likeBurst) return;
    const t = setTimeout(() => setLikeBurst(null), 800);
    return () => clearTimeout(t);
  }, [likeBurst]);

  return (
    <section
      ref={sectionRef}
      data-reel-slide
      data-reel-id={reel.feedKey}
      className="feed-snap-slide relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden bg-black"
    >
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <video
          key={reel.shortcode}
          ref={videoRef}
          src={attachVideo ? videoSrc(reel.shortcode) : undefined}
          className={`max-h-full max-w-full object-contain object-center ${
            showVideo ? "opacity-100" : "opacity-0"
          }`}
          loop
          playsInline
          preload={attachVideo ? "auto" : "none"}
          onLoadedData={onFirstFrame}
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
        <FavoriteButtonUI fav={fav} onToggle={toggleFav} pending={favoritePending} />

        <RailButton label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
          {muted ? <VolumeX size={26} /> : <Volume2 size={26} />}
        </RailButton>

        <a
          href={reel.reelUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on Instagram"
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
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pb-4">
        {reel.creator && (
          <p className="text-sm font-semibold text-white">@{reel.creator.username}</p>
        )}
        {reel.caption && (
          <p className="mt-1 line-clamp-3 max-w-2xl text-sm text-white/80">{reel.caption}</p>
        )}
      </div>
    </section>
  );
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
      onClick={onClick}
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
      ([entry]) => entry.isIntersecting && onVisible(),
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, enabled]);

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
