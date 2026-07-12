"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { formatScrubTime, progressFromPointer } from "@/components/reel-feed/player-gestures";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  /// Lift above the bottom reader nav when paused chrome is showing.
  lifted?: boolean;
}

/**
 * Instagram-style one-line scrubber: thin when paused, expands while dragging
 * so you can scrub from start → end without leaving the pause state.
 * Mount only while paused (parent unmounts on play) to avoid stale drag state.
 */
export function VideoScrubber({ videoRef, lifted = false }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const readMedia = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
      setProgress(Math.min(1, Math.max(0, el.currentTime / d)));
    }
  }, [videoRef]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    readMedia();

    const onTime = () => {
      if (dragging.current) return;
      readMedia();
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeked", onTime);
    el.addEventListener("loadedmetadata", onTime);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeked", onTime);
      el.removeEventListener("loadedmetadata", onTime);
    };
  }, [videoRef, readMedia]);

  const seekToClientX = (clientX: number) => {
    const track = trackRef.current;
    const el = videoRef.current;
    if (!track || !el) return;
    const rect = track.getBoundingClientRect();
    const next = progressFromPointer(clientX, rect.left, rect.width);
    const d = el.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    el.currentTime = next * d;
    setDuration(d);
    setProgress(next);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    setExpanded(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const currentSec = duration > 0 ? progress * duration : 0;

  return (
    <div
      className={`absolute inset-x-0 z-30 px-3 ${
        lifted
          ? // Clear the fixed reader nav (icon + label + padding + safe area).
            "bottom-[calc(5.15rem+env(safe-area-inset-bottom))]"
          : "bottom-2"
      }`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={trackRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(currentSec)}
        aria-valuetext={formatScrubTime(currentSec)}
        tabIndex={0}
        className={`group relative touch-none select-none ${
          expanded ? "h-8 py-2.5" : "h-6 py-2"
        }`}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          dragging.current = true;
          setExpanded(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          seekToClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          e.preventDefault();
          seekToClientX(e.clientX);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(e) => {
          const el = videoRef.current;
          if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
          const step = e.shiftKey ? 5 : 1;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const delta = e.key === "ArrowLeft" ? -step : step;
            el.currentTime = Math.min(el.duration, Math.max(0, el.currentTime + delta));
            readMedia();
          } else if (e.key === "Home") {
            e.preventDefault();
            el.currentTime = 0;
            readMedia();
          } else if (e.key === "End") {
            e.preventDefault();
            el.currentTime = el.duration;
            readMedia();
          }
        }}
      >
        <div
          className={`absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-white/30 ${
            expanded ? "h-1.5" : "h-[3px]"
          }`}
        >
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div
          className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md shadow-black/40 transition-[width,height,opacity] ${
            expanded ? "h-3.5 w-3.5 opacity-100" : "h-2 w-2 opacity-0 group-hover:opacity-100"
          }`}
          style={{ left: `${progress * 100}%` }}
        />

        {expanded && (
          <div
            className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white backdrop-blur-sm"
            style={{ left: `${progress * 100}%` }}
          >
            {formatScrubTime(currentSec)}
            {duration > 0 ? (
              <span className="text-white/55"> / {formatScrubTime(duration)}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
