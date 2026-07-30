import type { Platform } from "@prisma/client";

import type { ReelView } from "@/lib/types";

/// Server → client candidate for offline sync (metadata + on-disk size).
export interface OfflineCandidate extends ReelView {
  byteSize: number;
}

/// IndexedDB record for one offline reel.
export interface OfflineReelRecord {
  id: string;
  platform: Platform;
  shortcode: string;
  reelUrl: string;
  caption: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  likedAt: string | null;
  isFavorite: boolean;
  creator: { username: string; platform: Platform } | null;
  byteSize: number;
  savedAt: string;
  /// Manually pinned via "Take offline" — kept across pocket refreshes.
  pinned: boolean;
  videoBlob: Blob;
  thumbBlob: Blob | null;
}

export interface OfflineStats {
  count: number;
  totalBytes: number;
  maxBytes: number;
}

export interface OfflineSyncProgress {
  phase: "idle" | "fetching" | "downloading" | "evicting" | "done" | "error";
  message: string;
  done: number;
  total: number;
  totalBytes: number;
}
