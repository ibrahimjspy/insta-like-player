import type { Platform } from "@prisma/client";

import { OFFLINE_CONFIG } from "@/lib/offline/config";

export interface OfflineSizeKnown {
  id: string;
  platform: Platform;
  byteSize: number;
  isFavorite: boolean;
  isPinned?: boolean;
  /// Higher = keep longer / download sooner. Favorites should rank above recent.
  priority: number;
}

export function isOfflineAllowedPlatform(platform: Platform): boolean {
  return (OFFLINE_CONFIG.allowedPlatforms as readonly Platform[]).includes(platform);
}

export function isEligibleOfflineFile(params: {
  platform: Platform;
  byteSize: number;
}): boolean {
  if (!isOfflineAllowedPlatform(params.platform)) return false;
  if (params.byteSize <= 0) return false;
  if (params.byteSize > OFFLINE_CONFIG.maxFileBytes) return false;
  return true;
}

/// Sort candidates for download: higher priority first, then smaller files.
export function sortOfflineCandidates<T extends OfflineSizeKnown>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.byteSize - b.byteSize;
  });
}

/// Pick non-favorite, non-pinned records to remove until `neededBytes` fit.
/// Favorites and pinned "Take offline" items are never evicted by this helper.
export function pickEvictions<T extends OfflineSizeKnown>(
  cached: T[],
  neededBytes: number,
  maxBytes: number = OFFLINE_CONFIG.maxBytes,
): T[] {
  const current = cached.reduce((sum, r) => sum + r.byteSize, 0);
  let overflow = current + neededBytes - maxBytes;
  if (overflow <= 0) return [];

  const victims = [...cached]
    .filter((r) => !r.isFavorite && !r.isPinned)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.byteSize - a.byteSize;
    });

  const evict: T[] = [];
  for (const v of victims) {
    if (overflow <= 0) break;
    evict.push(v);
    overflow -= v.byteSize;
  }
  return evict;
}

/// Greedy pack: take sorted eligible candidates until the byte budget is full.
export function selectWithinBudget<T extends OfflineSizeKnown>(
  sortedEligible: T[],
  maxBytes: number = OFFLINE_CONFIG.maxBytes,
): T[] {
  const selected: T[] = [];
  let used = 0;
  for (const item of sortedEligible) {
    if (used + item.byteSize > maxBytes) continue;
    selected.push(item);
    used += item.byteSize;
  }
  return selected;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
