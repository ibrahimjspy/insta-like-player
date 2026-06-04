"use client";

import { useCallback, useEffect, useRef } from "react";

import { flushWatchTime, recordWatch } from "@/app/actions";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

const P = FEED_TASTE_CONFIG.player;
const S = FEED_TASTE_CONFIG.session;

type Params = {
  reelId: string;
  durationSec: number | null;
  isActive: boolean;
  attachVideo: boolean;
  autoScroll: boolean;
  onAutoScrollAdvance?: () => void;
};

/**
 * Accumulates watch seconds / loop counts and flushes to `addWatchTime` on deactivate.
 */
export function useReelWatchMetrics({
  reelId,
  durationSec,
  isActive,
  attachVideo,
  autoScroll,
  onAutoScrollAdvance,
}: Params) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watched = useRef(false);
  const accumulatedWatchSec = useRef(0);
  const sessionLoops = useRef(0);
  const autoScrollLoops = useRef(0);
  const lastVideoTime = useRef(0);
  const lastLoopDetectTime = useRef(0);

  const persistWatchTime = useCallback(() => {
    const sec = accumulatedWatchSec.current;
    const loops = sessionLoops.current;
    accumulatedWatchSec.current = 0;
    sessionLoops.current = 0;
    if (sec < S.minWatchSecToRecord && loops === 0) return;
    const el = videoRef.current;
    flushWatchTime(reelId, sec, el?.currentTime ?? 0, {
      durationSec,
      loopCount: loops,
    }).catch(() => undefined);
  }, [reelId, durationSec]);

  const recordSessionStart = useCallback(() => {
    if (watched.current) return;
    watched.current = true;
    recordWatch(reelId).catch(() => undefined);
  }, [reelId]);

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
  }, [isActive, attachVideo, persistWatchTime]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isActive) return;

    const onTimeUpdate = () => {
      if (!el.paused) {
        const t = el.currentTime;
        if (lastVideoTime.current > 0 && t >= lastVideoTime.current) {
          accumulatedWatchSec.current += Math.min(
            t - lastVideoTime.current,
            P.maxWatchDeltaPerTick,
          );
        }
        lastVideoTime.current = t;
      }

      if (el.paused) return;
      const duration = el.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (
        lastLoopDetectTime.current > duration * P.loopDetectPastRatio &&
        el.currentTime < duration * P.loopDetectRewindRatio
      ) {
        sessionLoops.current += 1;
        if (autoScroll) {
          autoScrollLoops.current += 1;
          if (autoScrollLoops.current >= P.autoScrollLoops) {
            autoScrollLoops.current = 0;
            onAutoScrollAdvance?.();
          }
        }
      }
      lastLoopDetectTime.current = el.currentTime;
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [isActive, attachVideo, autoScroll, onAutoScrollAdvance]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      if (accumulatedWatchSec.current >= S.checkpointMinSec) persistWatchTime();
    }, S.checkpointIntervalMs);
    return () => clearInterval(id);
  }, [isActive, persistWatchTime]);

  return { videoRef, recordSessionStart, persistWatchTime };
}
