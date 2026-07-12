"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export type SeekDirection = "back" | "forward";

interface Props {
  direction: SeekDirection;
  seconds: number;
  burstKey: number;
}

/// Netflix-style ±seek flash on double-tap left/right.
export function SeekFeedback({ direction, seconds, burstKey }: Props) {
  const back = direction === "back";

  return (
    <div
      key={burstKey}
      className={`pointer-events-none absolute inset-y-0 z-30 flex w-[42%] items-center justify-center seek-flash ${
        back ? "left-0" : "right-0"
      }`}
      aria-hidden
    >
      <div
        className={`flex flex-col items-center gap-1 rounded-full bg-black/35 px-5 py-4 text-white shadow-lg backdrop-blur-md ${
          back ? "seek-flash-left" : "seek-flash-right"
        }`}
      >
        <div className="flex items-center text-white/95">
          {back ? (
            <>
              <ChevronLeft size={18} strokeWidth={2.25} className="-mr-1 opacity-70" />
              <ChevronLeft size={22} strokeWidth={2.25} />
            </>
          ) : (
            <>
              <ChevronRight size={22} strokeWidth={2.25} />
              <ChevronRight size={18} strokeWidth={2.25} className="-ml-1 opacity-70" />
            </>
          )}
        </div>
        <span className="text-sm font-semibold tracking-wide tabular-nums">
          {back ? `−${seconds}` : `+${seconds}`}
        </span>
      </div>
    </div>
  );
}
