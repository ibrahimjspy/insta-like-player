/**
 * Pure helpers for feed player gestures (Netflix seek + Instagram scrubber).
 * Kept free of DOM so unit tests can lock the interaction math.
 */

export type TapZone = "back" | "forward" | "center";

/// Maps a tap's X position within the slide to a gesture zone.
export function classifyTapZone(
  clientX: number,
  boundsLeft: number,
  boundsWidth: number,
  sideRatio = 0.35,
): TapZone {
  if (!(boundsWidth > 0) || !Number.isFinite(clientX)) return "center";
  const ratio = Math.min(1, Math.max(0, sideRatio));
  const x = (clientX - boundsLeft) / boundsWidth;
  if (x < ratio) return "back";
  if (x > 1 - ratio) return "forward";
  return "center";
}

/// Clamps a relative seek onto [0, duration]. No-ops on unknown duration.
export function clampSeekTime(
  currentTime: number,
  deltaSec: number,
  duration: number,
): number | null {
  if (!Number.isFinite(currentTime) || !Number.isFinite(deltaSec)) return null;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.min(duration, Math.max(0, currentTime + deltaSec));
}

/// Maps a pointer X on a scrub track to a 0–1 progress fraction.
export function progressFromPointer(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
): number {
  if (!(trackWidth > 0) || !Number.isFinite(clientX)) return 0;
  return Math.min(1, Math.max(0, (clientX - trackLeft) / trackWidth));
}

/// Compact timestamp for scrubber tooltips (`0:05`, `1:02`).
export function formatScrubTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
