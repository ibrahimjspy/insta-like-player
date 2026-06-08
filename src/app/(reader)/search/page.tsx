import type { Platform } from "@prisma/client";
import Link from "next/link";

import { PlatformBadge } from "@/components/PlatformBadge";
import { ReelGrid } from "@/components/ReelGrid";
import { SearchBar } from "@/components/SearchBar";
import { FilterPill } from "@/components/ui/FilterPill";
import { PageHeader, ReaderPage } from "@/components/ui/PageHeader";
import { getCollections, getCreatorsWithCounts, searchReels } from "@/lib/queries";

export const dynamic = "force-dynamic";

const PLATFORM_OPTIONS = ["INSTAGRAM", "TIKTOK", "FACEBOOK"] as const satisfies readonly Platform[];
const PLATFORMS = new Set<Platform>(PLATFORM_OPTIONS);

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
  const buildQuery = (overrides: {
    q?: string;
    creator?: string;
    platform?: Platform;
  }) => {
    const params = new URLSearchParams();
    const merged = { q, creator, platform, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return query ? `/search?${query}` : "/search";
  };

  const [results, creators, collections] = await Promise.all([
    q || creator || platform ? searchReels({ query: q, creator, platform }) : Promise.resolve([]),
    getCreatorsWithCounts(),
    getCollections(),
  ]);
  const visibleCreators = platform ? creators.filter((c) => c.platform === platform) : creators;

  return (
    <ReaderPage>
      <PageHeader
        title="Search"
        description="Find videos by caption, creator, or hashtag across Instagram, TikTok, and Facebook."
      />

      <div className="mt-8">
        <SearchBar initialQuery={q ?? ""} platform={platform} />
      </div>

      <section className="mt-6">
        <h2 className="label-caps mb-3">Platform</h2>
        <div className="flex flex-wrap gap-2">
          <FilterPill href={buildQuery({ platform: undefined, creator: undefined })} active={!platform}>
            All platforms
          </FilterPill>
          {PLATFORM_OPTIONS.map((p) => (
            <FilterPill
              key={p}
              href={buildQuery({ platform: p, creator: undefined })}
              active={platform === p}
            >
              <PlatformBadge platform={p} verbose />
            </FilterPill>
          ))}
        </div>
      </section>

      {visibleCreators.length > 0 && (
        <section className="mt-8">
          <h2 className="label-caps mb-3">Creators</h2>
          <div className="flex flex-wrap gap-2">
            {visibleCreators.slice(0, 40).map((c) => {
              const active = creator === c.username && platform === c.platform;
              const href = buildQuery({ creator: c.username, platform: c.platform });
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
              href={buildQuery({ creator: undefined })}
              className="mt-3 inline-block text-sm text-muted hover:text-foreground"
            >
              Clear creator filter
            </Link>
          )}
        </section>
      )}

      <section className="mt-10">
        {q || creator || platform ? (
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
