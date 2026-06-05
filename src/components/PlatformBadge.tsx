import type { Platform } from "@prisma/client";

import { PLATFORM_LABEL } from "@/lib/platforms/types";

const TONE: Record<Platform, string> = {
  INSTAGRAM: "border-pink-500/30 bg-pink-500/10 text-pink-200",
  TIKTOK: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  FACEBOOK: "border-blue-500/30 bg-blue-500/10 text-blue-200",
};

const SHORT: Record<Platform, string> = {
  INSTAGRAM: "IG",
  TIKTOK: "TT",
  FACEBOOK: "FB",
};

interface Props {
  platform: Platform;
  /// Show full name (Instagram) instead of abbreviation (IG).
  verbose?: boolean;
  className?: string;
}

export function PlatformBadge({ platform, verbose = false, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${TONE[platform]} ${className}`}
    >
      {verbose ? PLATFORM_LABEL[platform] : SHORT[platform]}
    </span>
  );
}
