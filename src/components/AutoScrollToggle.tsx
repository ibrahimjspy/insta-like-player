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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        enabled
          ? "bg-white text-black"
          : "bg-white/8 text-white/65 hover:bg-white/12 hover:text-white"
      }`}
    >
      <ChevronsDown size={15} strokeWidth={2} />
      <span className="hidden sm:inline">Auto</span>
    </button>
  );
}
