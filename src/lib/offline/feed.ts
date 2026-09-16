import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import type { WatchIndex, WatchIndexEntry } from "@/lib/feed/watch-index";
import type { FeedOrder } from "@/lib/queries";

export type OfflineFeedItem = {
  id: string;
  likedAt?: string | Date | null;
  savedAt?: string | null;
  isFavorite?: boolean;
};

function reelTime(record: OfflineFeedItem): number {
  const value = record.likedAt ?? record.savedAt;
  if (value instanceof Date) return value.getTime();
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : 0;
}

function seededHash(value: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hoursAgo(entry: WatchIndexEntry, now: number): number {
  return (now - entry.lastWatchedAt) / 3_600_000;
}

/** Higher is better. Unseen first; recently watched last; seed shuffles ties. */
export function offlineRandomScore(
  item: OfflineFeedItem,
  seed: number,
  watchIndex: WatchIndex,
  now: number,
): number {
  const w = FEED_TASTE_CONFIG.scoreWeights;
  const t = FEED_TASTE_CONFIG.thresholds;
  const noise = seededHash(item.id, seed) / 4_294_967_296;
  const favorite = item.isFavorite ? w.favorite : 0;
  const entry = watchIndex[item.id];
  if (!entry) return w.unseenBoost + favorite + noise;

  let penalty = 0;
  const ageHours = hoursAgo(entry, now);
  if (ageHours < t.recent3hHours) penalty += w.recent3hPenalty;
  else if (ageHours < t.recent24hHours) penalty += w.recent24hRepeatPenalty;
  if (entry.watchCount >= t.overexposedWatchCount) penalty += w.overexposedPenalty;
  return favorite + noise - penalty;
}

/// Apply the same feed choices locally without requiring the Mac.
export function orderOfflineReels<T extends OfflineFeedItem>(
  records: T[],
  order: FeedOrder,
  randomSeed: number,
  watchIndex: WatchIndex = {},
  now = Date.now(),
): T[] {
  return [...records].sort((a, b) => {
    if (order === "random") {
      const delta =
        offlineRandomScore(b, randomSeed, watchIndex, now) -
        offlineRandomScore(a, randomSeed, watchIndex, now);
      return delta || a.id.localeCompare(b.id);
    }
    const delta = reelTime(a) - reelTime(b);
    if (delta !== 0) return order === "oldest" ? delta : -delta;
    return a.id.localeCompare(b.id);
  });
}

export function startWithResume<T extends { id: string }>(
  items: T[],
  resumeId: string | null | undefined,
): T[] {
  if (!resumeId) return items;
  const index = items.findIndex((item) => item.id === resumeId);
  if (index <= 0) return items;
  return [items[index], ...items.filter((item) => item.id !== resumeId)];
}

/**
 * Next For you page from a local pool. Never empty when the pool is non-empty:
 * after the session exclude list covers everything, wrap with a fresh ranking.
 */
export function nextOfflineRandomPage<T extends OfflineFeedItem>(
  pool: T[],
  excludeIds: readonly string[],
  seed: number,
  watchIndex: WatchIndex,
  take: number = FEED_TASTE_CONFIG.exclude.localPageSize,
  now = Date.now(),
): T[] {
  if (pool.length === 0 || take <= 0) return [];
  const ranked = orderOfflineReels(pool, "random", seed, watchIndex, now);
  const exclude = new Set(excludeIds);
  const unseen = ranked.filter((item) => !exclude.has(item.id));
  const lastShown = excludeIds[excludeIds.length - 1];
  const wrapped =
    unseen.length > 0
      ? unseen
      : ranked.filter((item) => item.id !== lastShown);
  const source = wrapped.length > 0 ? wrapped : ranked;
  return source.slice(0, Math.min(take, source.length));
}
