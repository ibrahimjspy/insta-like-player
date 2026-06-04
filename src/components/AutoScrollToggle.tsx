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
          ? "Auto-scroll on — advances after 2 loops"
          : "Auto-scroll off"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        enabled
          ? "border-white/20 bg-white text-black"
          : "border-white/10 bg-black/50 text-white/80 backdrop-blur-md hover:text-white"
      }`}
    >
      <ChevronsDown size={15} strokeWidth={2} />
      Auto
    </button>
  );
}
