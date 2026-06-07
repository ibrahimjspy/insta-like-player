"use client";

import { ScanEye } from "lucide-react";

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function VideoOnlyToggle({ enabled, onChange }: Props) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-label={enabled ? "Video-only mode on" : "Video-only mode off"}
      aria-pressed={enabled}
      title={enabled ? "Video-only on — tap to show overlays" : "Video-only off — hide icons and captions"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        enabled
          ? "border-white/20 bg-white text-black"
          : "border-white/10 bg-black/50 text-white/80 backdrop-blur-md hover:text-white"
      }`}
    >
      <ScanEye size={15} strokeWidth={2} />
      Clean
    </button>
  );
}
