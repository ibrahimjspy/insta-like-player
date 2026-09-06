export type PlaybackPosition = { reelId: string; time: number };

export function readPosition(key: string): PlaybackPosition | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value && typeof value.reelId === "string" &&
      Number.isFinite(value.time) && value.time >= 0 ? value : null;
  } catch { return null; }
}

export function savePosition(key: string, position: PlaybackPosition) {
  try { localStorage.setItem(key, JSON.stringify(position)); } catch { /* Storage unavailable. */ }
}
