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
    <div className="flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => router.push(`/?order=${opt.value}`)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            value === opt.value ? "bg-white text-black" : "text-white/80 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
