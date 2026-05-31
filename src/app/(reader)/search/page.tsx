import Link from "next/link";

import { ReelGrid } from "@/components/ReelGrid";
import { SearchBar } from "@/components/SearchBar";
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
    <div className="h-full overflow-y-auto p-5 md:p-8">
      <h1 className="mb-4 text-2xl font-bold">Search</h1>
      <SearchBar initialQuery={q ?? ""} />

      {creators.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Filter by creator
          </p>
          <div className="flex flex-wrap gap-2">
            {creators.slice(0, 40).map((c) => (
              <Link
                key={c.username}
                href={`/search?creator=${encodeURIComponent(c.username)}`}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  creator === c.username
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                @{c.username} <span className="opacity-60">({c.count})</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {q || creator ? (
          <>
            <p className="mb-3 text-sm text-muted">
              {results.length} result{results.length === 1 ? "" : "s"}
              {creator ? ` from @${creator}` : ""}
              {q ? ` for “${q}”` : ""}
            </p>
            <ReelGrid reels={results} collections={collections} />
          </>
        ) : (
          <p className="text-sm text-muted">
            Search your liked reels by caption, creator, or hashtag.
          </p>
        )}
      </div>
    </div>
  );
}
