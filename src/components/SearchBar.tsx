"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SearchBar({
  initialQuery = "",
  platform,
}: {
  initialQuery?: string;
  platform?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (platform) params.set("platform", platform);
    const query = params.toString();
    router.push(query ? `/search?${query}` : "/search");
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <div className="relative flex-1">
        <Search
          size={18}
          strokeWidth={1.75}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <Input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Captions, creators, hashtags…"
          className="pl-10"
        />
      </div>
      <Button type="submit" variant="primary" className="shrink-0">
        Search
      </Button>
    </form>
  );
}
