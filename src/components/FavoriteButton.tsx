"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";

import { toggleFavorite } from "@/app/actions";

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
  const [fav, setFav] = useState(initial);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    // Optimistic update; revert if the server action throws.
    const next = !fav;
    setFav(next);
    startTransition(async () => {
      try {
        const result = await toggleFavorite(reelId);
        setFav(result);
      } catch {
        setFav(!next);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
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
