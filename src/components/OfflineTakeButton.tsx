"use client";

import { Download, HardDriveDownload } from "lucide-react";
import { useCallback, useState, useTransition } from "react";

import { useOfflineOptional } from "@/components/OfflineProvider";
import { isOfflineAllowedPlatform } from "@/lib/offline/policy";
import type { ReelView } from "@/lib/types";

type Props = {
  reel: ReelView;
  size?: number;
  className?: string;
};

export function OfflineTakeButton({ reel, size = 24, className = "" }: Props) {
  const offline = useOfflineOptional();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allowed = isOfflineAllowedPlatform(reel.platform);
  const cached = offline?.isCached(reel.id) ?? false;
  const pinned = offline?.isPinned(reel.id) ?? false;

  const onToggle = useCallback(() => {
    if (!offline || !allowed) return;
    setError(null);
    startTransition(async () => {
      try {
        if (pinned) {
          await offline.unpinOffline(reel.id);
        } else {
          if (!navigator.onLine) {
            setError("Connect to your Mac to save offline");
            return;
          }
          const ok = await offline.takeOffline(reel);
          if (!ok) setError("Can't save (Facebook or file too large)");
        }
      } catch {
        setError("Save failed");
      }
    });
  }, [offline, allowed, pinned, reel]);

  if (!offline || !allowed) return null;

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={pending}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin from offline" : "Take offline"}
      title={
        error ??
        (pinned ? "Unpin from offline" : cached ? "Pin in offline pocket" : "Take offline")
      }
      className={`grid place-items-center transition-transform active:scale-90 ${
        cached ? "text-emerald-300" : "text-white/90 hover:text-white"
      } ${className}`}
    >
      {pinned ? (
        <HardDriveDownload size={size} strokeWidth={2} />
      ) : (
        <Download size={size} strokeWidth={2} />
      )}
    </button>
  );
}
