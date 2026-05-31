"use client";

import { Ban, ExternalLink, Trash2, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { deleteReel, recordWatch, skipReel } from "@/app/actions";
import { FavoriteButton } from "@/components/FavoriteButton";
import { type ReelView, thumbSrc, videoSrc } from "@/lib/types";

type FeedOrder = "recent" | "oldest" | "random";

const MUTE_KEY = "ilp_muted";

interface Props {
  initialItems: ReelView[];
  initialCursor: string | null;
  order: FeedOrder;
  /// When false, the feed renders a fixed list (no infinite scroll fetch).
  paginate?: boolean;
  emptyTitle?: string;
  emptyHint?: React.ReactNode;
}

export function ReelFeed({
  initialItems,
  initialCursor,
  order,
  paginate = true,
  emptyTitle,
  emptyHint,
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
    return <EmptyFeed title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <div className="feed-snap no-scrollbar h-[100dvh] overflow-y-scroll bg-black">
      {items.map((reel) => (
        <ReelSlide
          key={reel.id}
          reel={reel}
          muted={muted}
          onToggleMute={toggleMute}
          onDelete={onDelete}
          onSkip={onSkip}
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
}: {
  reel: ReelView;
  muted: boolean;
  onToggleMute: () => void;
  onDelete: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watched = useRef(false);

  // Keep the element's muted state in sync with the user's preference.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Autoplay when this slide is the dominant one in the viewport. We try to
  // play with sound; if the browser blocks unmuted autoplay, fall back to
  // muted so the video still plays (a tap/keypress later restores sound).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          el.muted = muted;
          el.play().catch(() => {
            el.muted = true;
            el.play().catch(() => undefined);
          });
          if (!watched.current) {
            watched.current = true;
            recordWatch(reel.id).catch(() => undefined);
          }
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [reel.id, muted]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => undefined);
    else el.pause();
  };

  return (
    <section className="relative flex h-[100dvh] w-full items-center justify-center">
      <video
        ref={videoRef}
        src={videoSrc(reel.shortcode)}
        poster={thumbSrc(reel.shortcode)}
        className="h-full w-full object-contain"
        loop
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      {/* Right-side action rail */}
      <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5 md:bottom-12">
        <FavoriteButton reelId={reel.id} initial={reel.isFavorite} />

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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pb-24 md:pb-6">
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
    <div ref={ref} className="grid h-16 place-items-center text-sm text-white/50">
      {loading ? "Loading…" : enabled ? "" : "You're all caught up"}
    </div>
  );
}

function EmptyFeed({ title, hint }: { title?: string; hint?: React.ReactNode }) {
  return (
    <div className="grid h-[100dvh] place-items-center bg-black p-8 text-center">
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
