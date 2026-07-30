import type { FeedOrder } from "@/lib/queries";
import type { OfflineReelRecord } from "@/lib/offline/types";

function reelTime(record: OfflineReelRecord): number {
  const value = record.likedAt ?? record.savedAt;
  const time = Date.parse(value);
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

/// Apply the same feed choices locally without requiring the Mac.
export function orderOfflineReels(
  records: OfflineReelRecord[],
  order: FeedOrder,
  randomSeed: number,
): OfflineReelRecord[] {
  return [...records].sort((a, b) => {
    if (order === "random") {
      const delta =
        seededHash(a.id, randomSeed) - seededHash(b.id, randomSeed);
      return delta || a.id.localeCompare(b.id);
    }
    const delta = reelTime(a) - reelTime(b);
    if (delta !== 0) return order === "oldest" ? delta : -delta;
    return a.id.localeCompare(b.id);
  });
}
