"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useOffline } from "@/components/OfflineProvider";
import { ReelFeed } from "@/components/ReelFeed";
import {
  createBlobUrlMap,
  formatBytes,
  getOfflineStats,
  listOfflineReels,
  markAutoRefreshDone,
  OFFLINE_CHANGED_EVENT,
  offlineRecordsToViews,
  refreshOfflinePocket,
  revokeBlobUrlMap,
  type OfflineStats,
  type OfflineSyncProgress,
} from "@/lib/offline";
import type { ReelView } from "@/lib/types";

export function OfflinePageClient() {
  const { autoSyncing, reloadIds } = useOffline();
  const [items, setItems] = useState<ReelView[]>([]);
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());
  const [stats, setStats] = useState<OfflineStats | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<OfflineSyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const mountedRef = useRef(true);

  const applyRecords = useCallback(async () => {
    const records = await listOfflineReels();
    const nextStats = await getOfflineStats();
    if (!mountedRef.current) return;
    const nextUrls = createBlobUrlMap(records);
    revokeBlobUrlMap(blobUrlsRef.current);
    blobUrlsRef.current = nextUrls;
    setBlobUrls(nextUrls);
    setItems(offlineRecordsToViews(records));
    setStats(nextStats);
    await reloadIds();
  }, [reloadIds]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const load = async () => {
      try {
        const records = await listOfflineReels();
        if (cancelled) return;
        const nextUrls = createBlobUrlMap(records);
        revokeBlobUrlMap(blobUrlsRef.current);
        blobUrlsRef.current = nextUrls;
        setBlobUrls(nextUrls);
        setItems(offlineRecordsToViews(records));
        setStats(await getOfflineStats());
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load offline library");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    const onChanged = () => {
      void Promise.all([listOfflineReels(), getOfflineStats()])
        .then(([records, nextStats]) => {
          if (cancelled) return;
          const nextUrls = createBlobUrlMap(records);
          revokeBlobUrlMap(blobUrlsRef.current);
          blobUrlsRef.current = nextUrls;
          setBlobUrls(nextUrls);
          setItems(offlineRecordsToViews(records));
          setStats(nextStats);
        })
        .catch((err) => console.warn("Failed to reload offline page", err));
    };
    window.addEventListener(OFFLINE_CHANGED_EVENT, onChanged);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.removeEventListener(OFFLINE_CHANGED_EVENT, onChanged);
      revokeBlobUrlMap(blobUrlsRef.current);
      blobUrlsRef.current = new Map();
    };
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const onRefresh = useCallback(async () => {
    if (!navigator.onLine) {
      setError("Connect to your Mac (Wi‑Fi or Tailscale) to refresh offline videos.");
      return;
    }
    setSyncing(true);
    setError(null);
    setProgress({
      phase: "fetching",
      message: "Starting…",
      done: 0,
      total: 0,
      totalBytes: 0,
    });
    try {
      // Suppress a focus/online auto-refresh while this manual refresh runs.
      markAutoRefreshDone();
      await refreshOfflinePocket((next) => {
        if (mountedRef.current) setProgress(next);
      });
      await applyRecords();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Refresh failed — is the Mac reachable?",
      );
      setProgress({
        phase: "error",
        message: "Refresh failed",
        done: 0,
        total: 0,
        totalBytes: 0,
      });
    } finally {
      if (mountedRef.current) setSyncing(false);
    }
  }, [applyRecords]);

  const resolveVideoSrc = useCallback(
    (reel: ReelView) => blobUrls.get(reel.id) ?? "",
    [blobUrls],
  );

  const feedKey = useMemo(() => items.map((i) => i.id).join(","), [items]);
  const busy = syncing || autoSyncing;

  const usageLabel = stats
    ? `${stats.count} videos · ${formatBytes(stats.totalBytes)} / ${formatBytes(stats.maxBytes)}`
    : null;

  return (
    <div className="relative flex h-full flex-col bg-black">
      <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Offline</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/65">
            {online ? (
              <Wifi size={12} className="shrink-0" />
            ) : (
              <WifiOff size={12} className="shrink-0" />
            )}
            <span className="truncate">
              {autoSyncing
                ? "Auto-syncing…"
                : online
                  ? "Online — refresh to sync"
                  : "Offline — playing local cache"}
              {usageLabel ? ` · ${usageLabel}` : ""}
            </span>
          </p>
          {progress && syncing && (
            <p className="mt-1 text-xs text-white/55">{progress.message}</p>
          )}
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={busy || !online}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition enabled:hover:bg-white/25 disabled:opacity-40"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
          {busy ? "Syncing" : "Refresh"}
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-white/60">
            Loading offline library…
          </div>
        ) : (
          <ReelFeed
            key={feedKey || "empty"}
            initialItems={items}
            initialCursor={null}
            order="recent"
            paginate={false}
            localOnly
            resolveVideoSrc={resolveVideoSrc}
            emptyTitle="Nothing offline yet"
            emptyHint={
              online ? (
                <>
                  Tap <span className="font-medium text-white/80">Refresh</span> while
                  connected to your Mac, or use{" "}
                  <span className="font-medium text-white/80">Take offline</span> on any
                  IG/TikTok reel. Cap: 2 GB (no Facebook).
                </>
              ) : (
                <>
                  Connect to your Mac (home Wi‑Fi or Tailscale), open this page, and tap
                  Refresh.
                </>
              )
            }
          />
        )}
      </div>
    </div>
  );
}
