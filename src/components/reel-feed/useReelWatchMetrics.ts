"use client";

import { useCallback, useEffect, useRef } from "react";

import { flushWatchTime, recordWatch } from "@/app/actions";
import { recordManualInterest } from "@/lib/feed/auto-ranking";
import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

const P = FEED_TASTE_CONFIG.player;
const S = FEED_TASTE_CONFIG.session;

type Params = {
  reelId: string;
  durationSec: number | null;
  isActive: boolean;
  attachVideo: boolean;
  autoScroll: boolean;
  persistEnabled?: boolean;
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
  persistEnabled = true,
  onAutoScrollAdvance,
}: Params) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const watched = useRef(false);
  const accumulatedWatchSec = useRef(0);
  const accumulatedLoops = useRef(0);
  const sessionWatchSec = useRef(0);
  const sessionWasAuto = useRef(false);
  const sessionMaxPositionSec = useRef(0);
  const sessionLoopCount = useRef(0);
  const autoScrollLoops = useRef(0);
  const lastVideoTime = useRef(0);
  const lastLoopDetectTime = useRef(0);

  const persistWatchTime = useCallback((classifySession = false) => {
    const sec = accumulatedWatchSec.current;
    const loops = accumulatedLoops.current;
    const totalWatchSec = sessionWatchSec.current;
    const totalLoops = sessionLoopCount.current;
    const el = videoRef.current;
    const maxPositionSec = Math.max(sessionMaxPositionSec.current, el?.currentTime ?? 0);

    accumulatedWatchSec.current = 0;
    accumulatedLoops.current = 0;

    if (classifySession) {
      recordManualInterest(reelId, totalWatchSec, durationSec, sessionWasAuto.current);
      sessionWasAuto.current = false;
      sessionWatchSec.current = 0;
      sessionMaxPositionSec.current = 0;
      sessionLoopCount.current = 0;
      watched.current = false;
    }

    const hasPersistedActivity = sec >= S.minWatchSecToRecord || loops > 0;
    const hasSessionActivity = totalWatchSec > 0 || totalLoops > 0;
    if (!persistEnabled) return;
    if (!hasPersistedActivity && (!classifySession || !hasSessionActivity)) return;

    flushWatchTime(reelId, sec, maxPositionSec, {
      durationSec,
      loopCount: loops,
      classify: classifySession,
      classificationWatchSec: totalWatchSec,
      classificationPositionSec: maxPositionSec,
      classificationLoopCount: totalLoops,
    }).catch(() => undefined);
  }, [reelId, durationSec, persistEnabled]);

  const recordSessionStart = useCallback(() => {
    if (watched.current) return;
    watched.current = true;
    if (!persistEnabled) return;
    recordWatch(reelId).catch(() => undefined);
  }, [reelId, persistEnabled]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !attachVideo) return;

    if (!isActive) {
      el.pause();
      lastVideoTime.current = 0;
      lastLoopDetectTime.current = 0;
      autoScrollLoops.current = 0;
      persistWatchTime(true);
      return;
    }
    autoScrollLoops.current = 0;
  }, [isActive, attachVideo, persistWatchTime]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isActive) return;

    const onTimeUpdate = () => {
      if (!el.paused) {
        if (autoScroll) sessionWasAuto.current = true;
        const t = el.currentTime;
        if (lastVideoTime.current > 0 && t >= lastVideoTime.current) {
          const delta = Math.min(
            t - lastVideoTime.current,
            P.maxWatchDeltaPerTick,
          );
          accumulatedWatchSec.current += delta;
          sessionWatchSec.current += delta;
        }
        sessionMaxPositionSec.current = Math.max(sessionMaxPositionSec.current, t);
        lastVideoTime.current = t;
      }

      if (el.paused) return;
      const duration = el.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (
        lastLoopDetectTime.current > duration * P.loopDetectPastRatio &&
        el.currentTime < duration * P.loopDetectRewindRatio
      ) {
        accumulatedLoops.current += 1;
        sessionLoopCount.current += 1;
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
      if (accumulatedWatchSec.current >= S.checkpointMinSec) persistWatchTime(false);
    }, S.checkpointIntervalMs);
    return () => clearInterval(id);
  }, [isActive, persistWatchTime]);

  return { videoRef, recordSessionStart, persistWatchTime };
}
