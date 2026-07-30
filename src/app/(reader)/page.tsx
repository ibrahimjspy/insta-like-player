import { Suspense } from "react";

import { FeedPageClient } from "@/components/FeedPageClient";

export const dynamic = "force-static";

export default function FeedPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-full place-items-center bg-black text-sm text-white/60">
          Loading feed…
        </div>
      }
    >
      <FeedPageClient />
    </Suspense>
  );
}
