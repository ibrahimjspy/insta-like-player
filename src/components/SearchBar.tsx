"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  return (
    <form onSubmit={submit} className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search captions, creators, #hashtags…"
        className="w-full rounded-full border border-border bg-surface px-5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
      >
        Search
      </button>
    </form>
  );
}
