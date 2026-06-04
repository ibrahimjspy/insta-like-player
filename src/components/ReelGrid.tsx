"use client";

import { Ban, Check, Play, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addReelToCollection,
  deleteReel,
  removeReelFromCollection,
  skipReel,
} from "@/app/actions";
import { FavoriteButton } from "@/components/FavoriteButton";
import { type ReelView, thumbSrc, videoSrc } from "@/lib/types";

interface CollectionOption {
  id: string;
  name: string;
}

interface Props {
  reels: ReelView[];
  /// When provided, the modal shows an "add to collection" menu.
  collections?: CollectionOption[];
  /// When set, cards show a "remove from this collection" button.
  removeFromCollectionId?: string;
}

export function ReelGrid({ reels, collections, removeFromCollectionId }: Props) {
  const [active, setActive] = useState<ReelView | null>(null);
  const [, startTransition] = useTransition();

  if (reels.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-sm text-muted">No reels here yet.</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {reels.map((reel) => (
          <div
            key={reel.id}
            className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-surface-2"
          >
            <button
              type="button"
              onClick={() => setActive(reel)}
              className="absolute inset-0 h-full w-full"
              aria-label="Play reel"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbSrc(reel.shortcode)}
                alt={reel.caption ?? "Reel thumbnail"}
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <span className="absolute inset-0 grid place-items-center bg-black/0 text-white/0 transition-colors group-hover:bg-black/30 group-hover:text-white">
                <Play size={36} fill="currentColor" />
              </span>
            </button>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              {reel.creator && (
                <p className="truncate text-xs font-medium text-white">
                  @{reel.creator.username}
                </p>
              )}
            </div>

            <div className="absolute right-1.5 top-1.5">
              <FavoriteButton reelId={reel.id} initial={reel.isFavorite} size={20} />
            </div>

            {removeFromCollectionId && (
              <button
                type="button"
                onClick={() =>
                  startTransition(() => void removeReelFromCollection(removeFromCollectionId, reel.id))
                }
                className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white hover:bg-black/80"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {active && (
        <ReelModal
          reel={active}
          collections={collections}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

function ReelModal({
  reel,
  collections,
  onClose,
}: {
  reel: ReelView;
  collections?: CollectionOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addedTo, setAddedTo] = useState<string | null>(null);

  const runAndRefresh = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      onClose();
      router.refresh();
    });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-md flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          src={videoSrc(reel.shortcode)}
          poster={thumbSrc(reel.shortcode)}
          className="max-h-[80vh] w-full rounded-xl bg-black object-contain"
          controls
          autoPlay
          loop
          playsInline
        />
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {reel.creator && (
              <p className="text-sm font-semibold text-white">@{reel.creator.username}</p>
            )}
            {reel.caption && (
              <p className="mt-1 line-clamp-3 text-sm text-white/70">{reel.caption}</p>
            )}
          </div>
          <FavoriteButton reelId={reel.id} initial={reel.isFavorite} />
        </div>

        {collections && collections.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Add to:</span>
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await addReelToCollection(c.id, reel.id);
                    setAddedTo(c.id);
                  })
                }
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  addedTo === c.id
                    ? "border-border-strong bg-white/15 text-white"
                    : "border-white/15 text-white/80 hover:border-white/25 hover:bg-white/10"
                }`}
              >
                {addedTo === c.id && <Check size={13} />}
                {c.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex gap-4 text-xs text-muted">
          <button
            type="button"
            disabled={pending}
            onClick={() => runAndRefresh(() => skipReel(reel.id))}
            className="flex items-center gap-1.5 hover:text-foreground"
          >
            <Ban size={15} /> Don&apos;t import
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Delete this reel and its downloaded video?"))
                runAndRefresh(() => deleteReel(reel.id));
            }}
            className="flex items-center gap-1.5 hover:text-red-500"
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 grid h-9 w-9 place-items-center rounded-full bg-surface text-white shadow-lg hover:bg-surface-2"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
