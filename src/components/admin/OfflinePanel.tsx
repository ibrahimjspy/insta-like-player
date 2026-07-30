"use client";

import { HardDriveDownload, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  formatBytes,
  getOfflineStats,
  markAutoRefreshDone,
  OFFLINE_CHANGED_EVENT,
  refreshOfflinePocket,
  type OfflineStats,
  type OfflineSyncProgress,
} from "@/lib/offline";

export function OfflinePanel() {
  const [stats, setStats] = useState<OfflineStats | null>(null);
  const [progress, setProgress] = useState<OfflineSyncProgress | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadStats = useCallback(async () => {
    setStats(await getOfflineStats());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getOfflineStats();
        if (!cancelled) setStats(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Offline storage unavailable");
        }
      }
    };
    void load();
    const onChanged = () => void load();
    window.addEventListener(OFFLINE_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_CHANGED_EVENT, onChanged);
    };
  }, []);

  const refresh = async () => {
    setSyncing(true);
    setError(null);
    markAutoRefreshDone();
    try {
      await refreshOfflinePocket(setProgress);
      await reloadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offline refresh failed");
    } finally {
      setSyncing(false);
    }
  };

  const pct =
    progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <section className="card-elevated p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted sm:h-10 sm:w-10">
          <HardDriveDownload size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">Phone offline pocket</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Cache Instagram and TikTok videos on this device (up to 2 GB).
            The normal Feed uses them automatically when the Mac is unreachable.
          </p>
          {stats && (
            <p className="mt-2 font-mono text-xs text-muted">
              {stats.count} videos · {formatBytes(stats.totalBytes)} /{" "}
              {formatBytes(stats.maxBytes)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <Button
          type="button"
          onClick={() => void refresh()}
          disabled={syncing}
          className="w-full sm:w-auto"
        >
          <RefreshCw
            size={16}
            className={syncing ? "animate-spin" : undefined}
          />
          {syncing ? "Refreshing…" : "Refresh this device"}
        </Button>
      </div>

      {syncing && progress && (
        <div className="mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-xs text-muted">{progress.message}</p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
