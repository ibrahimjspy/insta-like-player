import { OFFLINE_CONFIG } from "@/lib/offline/config";
import {
  deleteOfflineReel,
  getOfflineIds,
  getOfflineReel,
  listOfflineReels,
  putOfflineReel,
  requestOfflinePersistence,
} from "@/lib/offline/db";
import {
  isEligibleOfflineFile,
  isOfflineAllowedPlatform,
  pickEvictions,
  selectWithinBudget,
  sortOfflineCandidates,
} from "@/lib/offline/policy";
import type {
  OfflineCandidate,
  OfflineReelRecord,
  OfflineSyncProgress,
} from "@/lib/offline/types";
import { thumbSrc, videoSrc, type ReelView } from "@/lib/types";

export type SyncProgressHandler = (progress: OfflineSyncProgress) => void;

export const OFFLINE_CHANGED_EVENT = "like-player-offline-changed";

let mutationQueue: Promise<void> = Promise.resolve();

async function runOfflineMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueue;
  let release!: () => void;
  mutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export function notifyOfflineChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_CHANGED_EVENT));
}

function toReelView(record: OfflineReelRecord): ReelView {
  return {
    id: record.id,
    platform: record.platform,
    shortcode: record.shortcode,
    reelUrl: record.reelUrl,
    caption: record.caption,
    durationSec: record.durationSec,
    width: record.width,
    height: record.height,
    likedAt: record.likedAt,
    isFavorite: record.isFavorite,
    creator: record.creator,
  };
}

export function offlineRecordsToViews(records: OfflineReelRecord[]): ReelView[] {
  return records.map(toReelView);
}

export function createBlobUrlMap(records: OfflineReelRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of records) {
    map.set(r.id, URL.createObjectURL(r.videoBlob));
  }
  return map;
}

export function revokeBlobUrlMap(map: Map<string, string>): void {
  for (const url of map.values()) URL.revokeObjectURL(url);
}

async function fetchCandidates(): Promise<OfflineCandidate[]> {
  const res = await fetch("/api/offline/candidates");
  if (!res.ok) {
    throw new Error(`Failed to load offline candidates (${res.status})`);
  }
  return (await res.json()) as OfflineCandidate[];
}

async function downloadBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  return res.blob();
}

function candidatePriority(
  c: OfflineCandidate,
  index: number,
  favoriteCount: number,
): number {
  if (c.isFavorite) return 1_000_000 - index;
  return favoriteCount + (OFFLINE_CONFIG.candidateLimit - index);
}

async function storeRecord(
  reel: Pick<
    OfflineCandidate,
    | "id"
    | "platform"
    | "shortcode"
    | "reelUrl"
    | "caption"
    | "durationSec"
    | "width"
    | "height"
    | "likedAt"
    | "isFavorite"
    | "creator"
    | "byteSize"
  >,
  pinned: boolean,
): Promise<OfflineReelRecord> {
  const videoBlob = await downloadBlob(videoSrc(reel.platform, reel.shortcode));
  let thumbBlob: Blob | null = null;
  try {
    thumbBlob = await downloadBlob(thumbSrc(reel.platform, reel.shortcode));
  } catch {
    thumbBlob = null;
  }

  const record: OfflineReelRecord = {
    id: reel.id,
    platform: reel.platform,
    shortcode: reel.shortcode,
    reelUrl: reel.reelUrl,
    caption: reel.caption,
    durationSec: reel.durationSec,
    width: reel.width,
    height: reel.height,
    likedAt: reel.likedAt ? String(reel.likedAt) : null,
    isFavorite: reel.isFavorite,
    creator: reel.creator,
    byteSize: videoBlob.size || reel.byteSize,
    savedAt: new Date().toISOString(),
    pinned,
    videoBlob,
    thumbBlob,
  };
  await putOfflineReel(record);
  return record;
}

/// Pull IG/TikTok favorites + recent into IndexedDB until the 2 GB cap.
/// Manually pinned ("Take offline") reels are always kept.
async function refreshOfflinePocketUnlocked(
  onProgress?: SyncProgressHandler,
): Promise<{ saved: number; removed: number; totalBytes: number }> {
  const report = (
    partial: Partial<OfflineSyncProgress> &
      Pick<OfflineSyncProgress, "phase" | "message">,
  ) => {
    onProgress?.({
      done: 0,
      total: 0,
      totalBytes: 0,
      ...partial,
    });
  };

  report({ phase: "fetching", message: "Fetching candidates…" });
  const candidates = await fetchCandidates();
  const favoriteCount = candidates.filter((c) => c.isFavorite).length;

  const cached = await listOfflineReels();
  const pinnedRows = cached.filter((r) => r.pinned);
  const pinnedIds = new Set(pinnedRows.map((r) => r.id));
  const pinnedBytes = pinnedRows.reduce((s, r) => s + r.byteSize, 0);

  const eligible = sortOfflineCandidates(
    candidates
      .filter((c) =>
        isEligibleOfflineFile({ platform: c.platform, byteSize: c.byteSize }),
      )
      .filter((c) => !pinnedIds.has(c.id))
      .map((c, index) => ({
        ...c,
        priority: candidatePriority(c, index, favoriteCount),
      })),
  );

  const budget = Math.max(0, OFFLINE_CONFIG.maxBytes - pinnedBytes);
  const packed = selectWithinBudget(eligible, budget);
  const targetIds = new Set<string>([...pinnedIds, ...packed.map((c) => c.id)]);

  report({ phase: "evicting", message: "Pruning offline cache…" });
  let removed = 0;
  for (const row of cached) {
    if (!targetIds.has(row.id)) {
      await deleteOfflineReel(row.id);
      removed += 1;
    }
  }

  const idsNow = await getOfflineIds();
  const downloadQueue = packed.filter((c) => !idsNow.has(c.id));
  let saved = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < downloadQueue.length; i++) {
    const c = downloadQueue[i];
    report({
      phase: "downloading",
      message: `Downloading ${i + 1}/${downloadQueue.length}…`,
      done: i,
      total: downloadQueue.length,
      totalBytes: c.byteSize,
    });

    try {
      const existing = await getOfflineReel(c.id);
      await storeRecord(c, existing?.pinned ?? false);
      saved += 1;
    } catch (err) {
      console.warn("Offline download failed", c.id, err);
      failed += 1;
      processed = i + 1;
      if (err instanceof Error && err.name === "QuotaExceededError") {
        break;
      }
    }

    processed = i + 1;
    report({
      phase: "downloading",
      message: `Downloading ${Math.min(i + 1, downloadQueue.length)}/${downloadQueue.length}…`,
      done: i + 1,
      total: downloadQueue.length,
      totalBytes: c.byteSize,
    });
  }

  const latestCached = await listOfflineReels();
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  for (const row of latestCached) {
    const c = candidateById.get(row.id);
    if (c && c.isFavorite !== row.isFavorite) {
      await putOfflineReel({ ...row, isFavorite: c.isFavorite });
    }
  }

  const totalBytes = (await listOfflineReels()).reduce((s, r) => s + r.byteSize, 0);
  report({
    phase: "done",
    message: `Offline ready: ${saved} new, ${removed} removed${
      failed > 0 ? `, ${failed} failed` : ""
    }`,
    done: processed,
    total: downloadQueue.length,
    totalBytes,
  });

  notifyOfflineChanged();
  return { saved, removed, totalBytes };
}

export async function refreshOfflinePocket(
  onProgress?: SyncProgressHandler,
): Promise<{ saved: number; removed: number; totalBytes: number }> {
  return runOfflineMutation(async () => {
    await requestOfflinePersistence();
    return refreshOfflinePocketUnlocked(onProgress);
  });
}

/// Pin a reel from the feed into the offline pocket (IG/TikTok only).
async function takeReelOfflineUnlocked(reel: ReelView): Promise<boolean> {
  if (!isOfflineAllowedPlatform(reel.platform)) return false;
  if (!navigator.onLine) return false;

  const existing = await getOfflineReel(reel.id);
  if (existing) {
    if (!existing.pinned) {
      await putOfflineReel({ ...existing, pinned: true });
      notifyOfflineChanged();
    }
    return true;
  }

  // Probe size via a real download (we need the blob anyway).
  const videoBlob = await downloadBlob(videoSrc(reel.platform, reel.shortcode));
  if (!isEligibleOfflineFile({ platform: reel.platform, byteSize: videoBlob.size })) {
    return false;
  }

  const cached = await listOfflineReels();
  const evict = pickEvictions(
    cached.map((r) => ({
      id: r.id,
      platform: r.platform,
      byteSize: r.byteSize,
      isFavorite: r.isFavorite,
      isPinned: r.pinned,
      priority: r.pinned ? 2_000_000 : r.isFavorite ? 1_000_000 : 1,
    })),
    videoBlob.size,
  );

  const evictedBytes = evict.reduce((sum, row) => sum + row.byteSize, 0);
  const currentBytes = cached.reduce((sum, row) => sum + row.byteSize, 0);
  if (currentBytes - evictedBytes + videoBlob.size > OFFLINE_CONFIG.maxBytes) {
    return false;
  }

  for (const v of evict) await deleteOfflineReel(v.id);

  let thumbBlob: Blob | null = null;
  try {
    thumbBlob = await downloadBlob(thumbSrc(reel.platform, reel.shortcode));
  } catch {
    thumbBlob = null;
  }

  await putOfflineReel({
    id: reel.id,
    platform: reel.platform,
    shortcode: reel.shortcode,
    reelUrl: reel.reelUrl,
    caption: reel.caption,
    durationSec: reel.durationSec,
    width: reel.width,
    height: reel.height,
    likedAt: reel.likedAt ? String(reel.likedAt) : null,
    isFavorite: reel.isFavorite,
    creator: reel.creator,
    byteSize: videoBlob.size,
    savedAt: new Date().toISOString(),
    pinned: true,
    videoBlob,
    thumbBlob,
  });
  notifyOfflineChanged();
  return true;
}

export async function takeReelOffline(reel: ReelView): Promise<boolean> {
  return runOfflineMutation(async () => {
    await requestOfflinePersistence();
    return takeReelOfflineUnlocked(reel);
  });
}

/// Remove the manual pin. The automatic pocket may keep this reel until refresh.
export async function unpinReelOffline(reelId: string): Promise<void> {
  await runOfflineMutation(async () => {
    const existing = await getOfflineReel(reelId);
    if (existing?.pinned) {
      await putOfflineReel({ ...existing, pinned: false });
    }
  });
  notifyOfflineChanged();
}

/// @deprecated use takeReelOffline — kept for callers that only have an id.
export async function saveReelOffline(reelId: string): Promise<boolean> {
  const candidates = await fetchCandidates();
  const c = candidates.find((x) => x.id === reelId);
  if (!c) return false;
  return takeReelOffline(c);
}

/// True when Mac is reachable enough to serve offline candidates.
export async function canReachOfflineHost(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const res = await fetch("/api/offline/candidates", {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(1_500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function shouldAutoRefreshNow(now = Date.now()): boolean {
  if (typeof sessionStorage === "undefined") return true;
  const raw = sessionStorage.getItem(OFFLINE_CONFIG.autoRefreshStorageKey);
  if (!raw) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  return now - last >= OFFLINE_CONFIG.autoRefreshCooldownMs;
}

export function markAutoRefreshDone(now = Date.now()): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(OFFLINE_CONFIG.autoRefreshStorageKey, String(now));
}
