"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  canReachOfflineHost,
  getOfflineIds,
  getOfflinePinnedIds,
  markAutoRefreshDone,
  OFFLINE_CHANGED_EVENT,
  refreshOfflinePocket,
  shouldAutoRefreshNow,
  takeReelOffline,
  unpinReelOffline,
} from "@/lib/offline";
import { isOfflineAllowedPlatform } from "@/lib/offline/policy";
import type { ReelView } from "@/lib/types";

type OfflineContextValue = {
  offlineIds: Set<string>;
  pinnedIds: Set<string>;
  autoSyncing: boolean;
  isCached: (reelId: string) => boolean;
  isPinned: (reelId: string) => boolean;
  reloadIds: () => Promise<void>;
  takeOffline: (reel: ReelView) => Promise<boolean>;
  unpinOffline: (reelId: string) => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [offlineIds, setOfflineIds] = useState<Set<string>>(() => new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  const [autoSyncing, setAutoSyncing] = useState(false);
  const syncingRef = useRef(false);

  const reloadIds = useCallback(async () => {
    const [ids, pins] = await Promise.all([getOfflineIds(), getOfflinePinnedIds()]);
    setOfflineIds(ids);
    setPinnedIds(pins);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const [ids, pins] = await Promise.all([
          getOfflineIds(),
          getOfflinePinnedIds(),
        ]);
        if (!cancelled) {
          setOfflineIds(ids);
          setPinnedIds(pins);
        }
      } catch (err) {
        console.warn("Offline cache unavailable", err);
      }
    };
    void boot();

    const onChanged = () => {
      void Promise.all([getOfflineIds(), getOfflinePinnedIds()])
        .then(([ids, pins]) => {
          if (!cancelled) {
            setOfflineIds(ids);
            setPinnedIds(pins);
          }
        })
        .catch((err) => console.warn("Failed to refresh offline cache state", err));
    };
    window.addEventListener(OFFLINE_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_CHANGED_EVENT, onChanged);
    };
  }, []);

  const runAutoRefresh = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      if (!shouldAutoRefreshNow()) return;
      if ((await getOfflineIds()).size === 0) return;
      if (!(await canReachOfflineHost())) return;

      setAutoSyncing(true);
      await refreshOfflinePocket();
      markAutoRefreshDone();
      await reloadIds();
    } catch (err) {
      console.warn("Offline auto-refresh failed", err);
    } finally {
      syncingRef.current = false;
      setAutoSyncing(false);
    }
  }, [reloadIds]);

  useEffect(() => {
    const tryRefresh = () => {
      void runAutoRefresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) tryRefresh();
    };
    window.addEventListener("online", tryRefresh);
    window.addEventListener("focus", tryRefresh);
    document.addEventListener("visibilitychange", onVisible);
    // Existing pockets refresh on app launch; an empty pocket still requires
    // the user's first manual Refresh, avoiding a surprise 2 GB download.
    const bootTimer = window.setTimeout(() => {
      if (navigator.onLine) tryRefresh();
    }, 1500);
    return () => {
      window.removeEventListener("online", tryRefresh);
      window.removeEventListener("focus", tryRefresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(bootTimer);
    };
  }, [runAutoRefresh]);

  const takeOffline = useCallback(
    async (reel: ReelView) => {
      if (!isOfflineAllowedPlatform(reel.platform)) return false;
      const ok = await takeReelOffline(reel);
      if (ok) await reloadIds();
      return ok;
    },
    [reloadIds],
  );

  const unpinOffline = useCallback(
    async (reelId: string) => {
      await unpinReelOffline(reelId);
      await reloadIds();
    },
    [reloadIds],
  );

  const value = useMemo<OfflineContextValue>(
    () => ({
      offlineIds,
      pinnedIds,
      autoSyncing,
      isCached: (reelId: string) => offlineIds.has(reelId),
      isPinned: (reelId: string) => pinnedIds.has(reelId),
      reloadIds,
      takeOffline,
      unpinOffline,
    }),
    [offlineIds, pinnedIds, autoSyncing, reloadIds, takeOffline, unpinOffline],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOffline must be used within OfflineProvider");
  }
  return ctx;
}

/// Safe for components that may render outside the reader shell.
export function useOfflineOptional(): OfflineContextValue | null {
  return useContext(OfflineContext);
}
