"use client";

import { useRouter } from "next/navigation";

const OPTIONS = [
  { value: "recent", label: "Recent" },
  { value: "oldest", label: "Oldest" },
  { value: "random", label: "For you" },
] as const;

export function OrderSelect({ value }: { value: string }) {
  const router = useRouter();

  return (
    <div
      className="flex gap-0.5 rounded-full bg-white/8 p-0.5"
      role="tablist"
      aria-label="Feed order"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => router.push(`/?order=${opt.value}`)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-white text-black shadow-sm"
                : "text-white/65 hover:bg-white/8 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
