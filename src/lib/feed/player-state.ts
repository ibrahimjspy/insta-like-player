export type PlaybackPosition = { reelId: string; time: number };

let positionWritesEnabled = true;

/** Block writes while restarting a feed so the outgoing player cannot restore the old clip. */
export function setPositionWritesEnabled(enabled: boolean) {
  positionWritesEnabled = enabled;
}

export function readPosition(key: string): PlaybackPosition | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value && typeof value.reelId === "string" &&
      Number.isFinite(value.time) && value.time >= 0 ? value : null;
  } catch { return null; }
}

export function savePosition(key: string, position: PlaybackPosition) {
  if (!positionWritesEnabled) return;
  try { localStorage.setItem(key, JSON.stringify(position)); } catch { /* Storage unavailable. */ }
}

export function clearPosition(key: string) {
  try { localStorage.removeItem(key); } catch { /* Storage unavailable. */ }
}
