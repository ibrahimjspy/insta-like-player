"use client";

import { Ban, ExternalLink, Heart, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { deleteReel, recordWatch, skipReel } from "@/app/actions";
import { FavoriteButtonUI, useFavorite } from "@/components/FavoriteButton";
import { type ReelView, thumbSrc, videoSrc } from "@/lib/types";

type FeedOrder = "recent" | "oldest" | "random";

const MUTE_KEY = "ilp_muted";
const DOUBLE_TAP_MS = 320;

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
}

export function ReelFeed({
  initialItems,
  initialCursor,
  order,
  paginate = true,
  emptyTitle,
  emptyHint,
  onOrderBarVisibility,
}: Props) {
  const [items, setItems] = useState<ReelView[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  // Audio ON by default; remember the user's choice across sessions. Read
  // synchronously so there's no muted→unmuted flash on first paint.
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

  const hasMore = paginate && order !== "random" && cursor !== null;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reels?order=${order}&cursor=${encodeURIComponent(cursor ?? "")}`,
      );
      const page = (await res.json()) as { items: ReelView[]; nextCursor: string | null };
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, order, cursor]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const onDelete = useCallback(
    (id: string) => {
      removeItem(id);
      deleteReel(id).catch(() => undefined);
    },
    [removeItem],
  );

  const onSkip = useCallback(
    (id: string) => {
      removeItem(id);
      skipReel(id).catch(() => undefined);
    },
    [removeItem],
  );

  if (items.length === 0) {
    onOrderBarVisibility?.(true);
    return <EmptyFeed title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className="feed-snap no-scrollbar h-full overflow-x-hidden overflow-y-auto bg-black">
      {items.map((reel) => (
        <ReelSlide
          key={reel.id}
          reel={reel}
          muted={muted}
          onToggleMute={toggleMute}
          onDelete={onDelete}
          onSkip={onSkip}
          onOrderBarVisibility={onOrderBarVisibility}
        />
      ))}
      <Sentinel onVisible={loadMore} enabled={hasMore} loading={loading} />
    </div>
  );
}

function ReelSlide({
  reel,
  muted,
  onToggleMute,
  onDelete,
  onSkip,
  onOrderBarVisibility,
}: {
  reel: ReelView;
  muted: boolean;
  onToggleMute: () => void;
  onDelete: (id: string) => void;
  onSkip: (id: string) => void;
  onOrderBarVisibility?: (visible: boolean) => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watched = useRef(false);
  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { fav, toggle: toggleFav, like, pending: favoritePending } = useFavorite(
    reel.id,
    reel.isFavorite,
  );
  const [likeBurst, setLikeBurst] = useState<{ x: number; y: number; key: number } | null>(
    null,
  );
  /// Only attach video src near the viewport so phones over Tailscale don't
  /// open many full downloads at once (Safari looks like it's "still loading").
  const [loadVideo, setLoadVideo] = useState(false);
  const [active, setActive] = useState(false);

  const syncOrderBar = useCallback(
    (isActive: boolean, el: HTMLVideoElement | null) => {
      if (!onOrderBarVisibility) return;
      onOrderBarVisibility(isActive && (el?.paused ?? true));
    },
    [onOrderBarVisibility],
  );

  useEffect(() => {
    const root = sectionRef.current;
    if (!root) return;

    const loader = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLoadVideo(true);
      },
      { rootMargin: "200px", threshold: 0 },
    );
    loader.observe(root);
    return () => loader.disconnect();
  }, []);

  // Keep the element's muted state in sync with the user's preference.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Autoplay when this slide is the dominant one in the viewport. We try to
  // play with sound; if the browser blocks unmuted autoplay, fall back to
  // muted so the video still plays (a tap/keypress later restores sound).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !loadVideo) return;

    const root = sectionRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isActive = entry.isIntersecting && entry.intersectionRatio >= 0.85;
        setActive(isActive);
        if (isActive) {
          el.muted = muted;
          void el
            .play()
            .catch(() => {
              el.muted = true;
              return el.play();
            })
            .catch(() => undefined)
            .finally(() => syncOrderBar(true, el));
          if (!watched.current) {
            watched.current = true;
            recordWatch(reel.id).catch(() => undefined);
          }
        } else {
          el.pause();
          syncOrderBar(false, el);
        }
      },
      { threshold: [0, 0.85, 1] },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, [reel.id, muted, loadVideo, syncOrderBar]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => undefined);
    else el.pause();
  };

  const onVideoPlay = () => {
    if (active) syncOrderBar(true, videoRef.current);
  };

  const onVideoPause = () => {
    if (active) syncOrderBar(true, videoRef.current);
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
      className="feed-snap-slide relative flex h-full min-h-0 w-full shrink-0 items-center justify-center overflow-hidden"
    >
      {loadVideo && !active && (
        <div className="pointer-events-none absolute z-10 text-sm text-white/50">
          Loading video…
        </div>
      )}
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
            className="like-burst text-accent drop-shadow-lg"
          />
        </div>
      )}

      <video
        ref={videoRef}
        src={loadVideo ? videoSrc(reel.shortcode) : undefined}
        poster={thumbSrc(reel.shortcode)}
        className="h-full w-full object-contain"
        loop
        playsInline
        preload="none"
        onPointerUp={onVideoTap}
        onPlay={onVideoPlay}
        onPause={onVideoPause}
      />

      {/* Right-side action rail — kept inside slide bounds (no bleed on snap) */}
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
          onClick={() => onSkip(reel.id)}
        >
          <Ban size={24} />
        </RailButton>

        <RailButton
          label="Delete reel"
          onClick={() => {
            if (confirm("Delete this reel and its downloaded video?")) onDelete(reel.id);
          }}
          className="hover:text-red-500"
        >
          <Trash2 size={24} />
        </RailButton>
      </div>

      {/* Bottom gradient + caption */}
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
              <a href="/admin" className="text-accent underline">
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
