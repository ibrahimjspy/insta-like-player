"use client";

import { Download } from "lucide-react";

export function OfflineCachedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-200 ${className}`}
      title="Saved for offline"
    >
      <Download size={10} strokeWidth={2.5} />
      Offline
    </span>
  );
}
