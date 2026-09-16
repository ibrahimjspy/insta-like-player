import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

export type WatchIndexEntry = {
  lastWatchedAt: number;
  watchCount: number;
};

export type WatchIndex = Record<string, WatchIndexEntry>;

const KEY = FEED_TASTE_CONFIG.watchIndex.storageKey;
const MAX = FEED_TASTE_CONFIG.watchIndex.maxEntries;

function isEntry(value: unknown): value is WatchIndexEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as WatchIndexEntry;
  return (
    Number.isFinite(entry.lastWatchedAt) &&
    entry.lastWatchedAt > 0 &&
    Number.isFinite(entry.watchCount) &&
    entry.watchCount >= 1
  );
}

export function readWatchIndex(): WatchIndex {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, entry]) => isEntry(entry)),
    ) as WatchIndex;
  } catch {
    return {};
  }
}

function writeWatchIndex(index: WatchIndex): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(index));
  } catch {
    /* Storage unavailable. */
  }
}

/** LRU-trim by last write order (Object insertion order). */
function trimIndex(index: WatchIndex): WatchIndex {
  const entries = Object.entries(index);
  if (entries.length <= MAX) return index;
  return Object.fromEntries(entries.slice(-MAX));
}

/** Record that a reel started playing. Safe to call online or offline. */
export function markWatched(reelId: string, at = Date.now()): WatchIndex {
  if (!reelId) return readWatchIndex();
  const index = readWatchIndex();
  const prev = index[reelId];
  delete index[reelId];
  index[reelId] = {
    lastWatchedAt: at,
    watchCount: (prev?.watchCount ?? 0) + 1,
  };
  const next = trimIndex(index);
  writeWatchIndex(next);
  return next;
}

/** Newest-first ids watched within `recencyMs` (default last 24h). */
export function recentWatchedIds(
  index: WatchIndex,
  now = Date.now(),
  recencyMs: number = FEED_TASTE_CONFIG.thresholds.recent24hHours * 3_600_000,
  max: number = FEED_TASTE_CONFIG.exclude.maxSessionIds,
): string[] {
  return Object.entries(index)
    .filter(([, entry]) => now - entry.lastWatchedAt <= recencyMs)
    .sort((a, b) => b[1].lastWatchedAt - a[1].lastWatchedAt)
    .slice(0, max)
    .map(([id]) => id);
}
