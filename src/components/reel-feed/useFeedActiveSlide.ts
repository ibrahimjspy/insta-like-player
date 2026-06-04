"use client";

import { useEffect, useRef } from "react";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

const ACTIVE_RATIO = FEED_TASTE_CONFIG.player.activeIntersectionRatio;
const THRESHOLDS = [0, 0.25, 0.5, 0.75, 0.9, 1] as const;

/**
 * Tracks which feed slide is most visible.
 * `data-reel-id` must be feedKey (not reel.id) when the same reel can appear twice.
 */
export function useFeedActiveSlide(
  feedRef: React.RefObject<HTMLDivElement | null>,
  itemsLength: number,
  onActiveChange: (feedKey: string | null) => void,
) {
  useEffect(() => {
    const root = feedRef.current;
    if (!root || itemsLength === 0) return;

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
      onActiveChange(bestRatio >= ACTIVE_RATIO ? bestId : null);
    };

    const observer = new IntersectionObserver(pickActive, {
      root,
      threshold: [...THRESHOLDS],
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
  }, [feedRef, itemsLength, onActiveChange]);
}

/** Runs when user scrolls to a new slide (unpause chrome). */
export function useOnReelActivated(
  activeReelId: string | null,
  onActivated: () => void,
) {
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!activeReelId || activeReelId === prev.current) return;
    prev.current = activeReelId;
    onActivated();
  }, [activeReelId, onActivated]);
}
