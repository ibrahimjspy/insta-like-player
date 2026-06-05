import type { Platform } from "@prisma/client";
import Link from "next/link";

import { PlatformBadge } from "@/components/PlatformBadge";
import { ReelGrid } from "@/components/ReelGrid";
import { SearchBar } from "@/components/SearchBar";
import { FilterPill } from "@/components/ui/FilterPill";
import { PageHeader, ReaderPage } from "@/components/ui/PageHeader";
import { getCollections, getCreatorsWithCounts, searchReels } from "@/lib/queries";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set<Platform>(["INSTAGRAM", "TIKTOK", "FACEBOOK"]);

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; creator?: string; platform?: string }>;
}) {
  const { q, creator, platform: platformParam } = await searchParams;
  const platform =
    platformParam && PLATFORMS.has(platformParam as Platform)
      ? (platformParam as Platform)
      : undefined;

  const [results, creators, collections] = await Promise.all([
    q || creator ? searchReels({ query: q, creator, platform }) : Promise.resolve([]),
    getCreatorsWithCounts(),
    getCollections(),
  ]);

  return (
    <ReaderPage>
      <PageHeader
        title="Search"
        description="Find videos by caption, creator, or hashtag across Instagram, TikTok, and Facebook."
      />

      <div className="mt-8">
        <SearchBar initialQuery={q ?? ""} />
      </div>

      {creators.length > 0 && (
        <section className="mt-8">
          <h2 className="label-caps mb-3">Creators</h2>
          <div className="flex flex-wrap gap-2">
            {creators.slice(0, 40).map((c) => {
              const active = creator === c.username && platform === c.platform;
              const href = `/search?creator=${encodeURIComponent(c.username)}&platform=${c.platform}`;
              return (
                <FilterPill key={`${c.platform}:${c.username}`} href={href} active={active}>
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformBadge platform={c.platform} />
                    @{c.username}
                    <span className="opacity-50">{c.count}</span>
                  </span>
                </FilterPill>
              );
            })}
          </div>
          {creator && (
            <Link
              href="/search"
              className="mt-3 inline-block text-sm text-muted hover:text-foreground"
            >
              Clear creator filter
            </Link>
          )}
        </section>
      )}

      <section className="mt-10">
        {q || creator ? (
          <>
            <p className="mb-4 text-sm text-muted">
              {results.length} result{results.length === 1 ? "" : "s"}
              {creator ? ` from @${creator}` : ""}
              {platform ? ` on ${platform.toLowerCase()}` : ""}
              {q ? ` matching “${q}”` : ""}
            </p>
            <ReelGrid reels={results} collections={collections} />
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            Enter a query or pick a creator to browse your downloaded videos.
          </p>
        )}
      </section>
    </ReaderPage>
  );
}
