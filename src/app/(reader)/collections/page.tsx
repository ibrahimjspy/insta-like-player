import Link from "next/link";

import { createCollection, deleteCollection } from "@/app/actions";
import { getCollections } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await getCollections();

  return (
    <div className="h-[100dvh] overflow-y-auto p-5 md:p-8">
      <h1 className="mb-4 text-2xl font-bold">Collections</h1>

      <form
        action={createCollection}
        className="mb-8 flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 sm:flex-row"
      >
        <input
          name="name"
          required
          placeholder="New collection name (e.g. Funny, Programming)"
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          name="description"
          placeholder="Description (optional)"
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Create
        </button>
      </form>

      {collections.length === 0 ? (
        <p className="text-sm text-muted">
          No collections yet. Create one above, then add reels from Search or Favorites.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/50"
            >
              <Link href={`/collections/${c.id}`} className="block">
                <h2 className="font-semibold">{c.name}</h2>
                {c.description && (
                  <p className="mt-1 line-clamp-3 text-sm text-muted">{c.description}</p>
                )}
                <p className="mt-3 text-xs text-muted">
                  {c._count.reels} reel{c._count.reels === 1 ? "" : "s"}
                </p>
              </Link>
              <form action={deleteCollection.bind(null, c.id)} className="absolute right-3 top-3">
                <button
                  type="submit"
                  aria-label="Delete collection"
                  className="text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                >
                  ✕
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
