"use client";

import { ChevronsDown } from "lucide-react";

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function AutoScrollToggle({ enabled, onChange }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-label={enabled ? "Auto-scroll on" : "Auto-scroll off"}
      aria-pressed={enabled}
      title={
        enabled
          ? "Auto-scroll: on (next reel after 2 loops)"
          : "Auto-scroll: off (next reel after 2 loops)"
      }
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        enabled
          ? "bg-white text-black"
          : "bg-black/50 text-white/80 backdrop-blur hover:text-white"
      }`}
    >
      <ChevronsDown size={16} className="shrink-0" />
      <span>Auto</span>
    </button>
  );
}
