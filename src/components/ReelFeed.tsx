"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { recordWatch } from "@/app/actions";
import { FavoriteButton } from "@/components/FavoriteButton";
import { type ReelView, thumbSrc, videoSrc } from "@/lib/types";

type FeedOrder = "recent" | "oldest" | "random";

interface Props {
  initialItems: ReelView[];
  initialCursor: string | null;
  order: FeedOrder;
}

export function ReelFeed({ initialItems, initialCursor, order }: Props) {
  const [items, setItems] = useState<ReelView[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(true);

  const hasMore = order !== "random" && cursor !== null;

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

  if (items.length === 0) {
    return <EmptyFeed />;
  }

  return (
    <div className="feed-snap no-scrollbar h-[100dvh] overflow-y-scroll bg-black">
      {items.map((reel) => (
        <ReelSlide
          key={reel.id}
          reel={reel}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
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
}: {
  reel: ReelView;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watched = useRef(false);

  // Autoplay when this slide is the dominant one in the viewport.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          el.play().catch(() => undefined);
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
  }, [reel.id]);

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
        muted={muted}
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      {/* Right-side action rail */}
      <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5 md:bottom-10">
        <FavoriteButton reelId={reel.id} initial={reel.isFavorite} />
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="text-2xl text-white/80 transition-transform active:scale-90 hover:text-white"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <a
          href={reel.reelUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on Instagram"
          className="text-xl text-white/80 transition-transform active:scale-90 hover:text-white"
        >
          ↗
        </a>
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

function EmptyFeed() {
  return (
    <div className="grid h-[100dvh] place-items-center bg-black p-8 text-center">
      <div className="max-w-md">
        <h2 className="text-xl font-semibold text-white">No reels to play yet</h2>
        <p className="mt-2 text-sm text-white/70">
          Import your Instagram likes export and download the media from the{" "}
          <a href="/admin" className="text-accent underline">
            Admin
          </a>{" "}
          page to start building your library.
        </p>
      </div>
    </div>
  );
}
