"use client";

import { Heart } from "lucide-react";
import { useCallback, useState, useTransition } from "react";

import { toggleFavorite } from "@/app/actions";

export function useFavorite(reelId: string, initial: boolean) {
  const [fav, setFav] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = useCallback(() => {
    setFav((current) => {
      const next = !current;
      startTransition(async () => {
        try {
          const result = await toggleFavorite(reelId);
          setFav(result);
        } catch {
          setFav(current);
        }
      });
      return next;
    });
  }, [reelId]);

  /// Double-tap like: favorite if needed; no-op when already favorited.
  const like = useCallback(() => {
    setFav((current) => {
      if (current) return current;
      startTransition(async () => {
        try {
          const result = await toggleFavorite(reelId);
          setFav(result);
        } catch {
          setFav(false);
        }
      });
      return true;
    });
  }, [reelId]);

  return { fav, toggle, like, pending };
}

type ButtonProps = {
  size?: number;
  className?: string;
  fav: boolean;
  onToggle: () => void;
  pending?: boolean;
};

export function FavoriteButtonUI({
  fav,
  onToggle,
  pending,
  size = 26,
  className = "",
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      className={`grid place-items-center transition-transform active:scale-90 ${
        fav ? "text-accent" : "text-white/90 hover:text-white"
      } ${className}`}
    >
      <Heart size={size} fill={fav ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}

export function FavoriteButton({
  reelId,
  initial,
  size = 26,
  className = "",
}: {
  reelId: string;
  initial: boolean;
  size?: number;
  className?: string;
}) {
  const { fav, toggle, pending } = useFavorite(reelId, initial);
  return (
    <FavoriteButtonUI
      fav={fav}
      onToggle={toggle}
      pending={pending}
      size={size}
      className={className}
    />
  );
}
