import Link from "next/link";

import { ReelGrid } from "@/components/ReelGrid";
import { SearchBar } from "@/components/SearchBar";
import { FilterPill } from "@/components/ui/FilterPill";
import { PageHeader, ReaderPage } from "@/components/ui/PageHeader";
import { getCollections, getCreatorsWithCounts, searchReels } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; creator?: string }>;
}) {
  const { q, creator } = await searchParams;

  const [results, creators, collections] = await Promise.all([
    q || creator ? searchReels({ query: q, creator }) : Promise.resolve([]),
    getCreatorsWithCounts(),
    getCollections(),
  ]);

  return (
    <ReaderPage>
      <PageHeader
        title="Search"
        description="Find reels by caption, creator, or hashtag across your library."
      />

      <div className="mt-8">
        <SearchBar initialQuery={q ?? ""} />
      </div>

      {creators.length > 0 && (
        <section className="mt-8">
          <h2 className="label-caps mb-3">Creators</h2>
          <div className="flex flex-wrap gap-2">
            {creators.slice(0, 40).map((c) => (
              <FilterPill
                key={c.username}
                href={`/search?creator=${encodeURIComponent(c.username)}`}
                active={creator === c.username}
              >
                @{c.username}
                <span className="ml-1 opacity-50">{c.count}</span>
              </FilterPill>
            ))}
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
              {q ? ` matching “${q}”` : ""}
            </p>
            <ReelGrid reels={results} collections={collections} />
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted">
            Enter a query or pick a creator to browse your downloaded reels.
          </p>
        )}
      </section>
    </ReaderPage>
  );
}
