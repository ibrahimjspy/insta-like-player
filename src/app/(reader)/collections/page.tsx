import Link from "next/link";
import { Trash2 } from "lucide-react";

import { createCollection, deleteCollection } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PageHeader, ReaderPage } from "@/components/ui/PageHeader";
import { getCollections } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const collections = await getCollections();

  return (
    <ReaderPage>
      <PageHeader
        title="Collections"
        description="Organize reels into curated groups. Add items from the feed or Search."
      />

      <form
        action={createCollection}
        className="card mt-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-3 sm:space-y-0 sm:flex sm:gap-3">
          <Input name="name" required placeholder="Collection name" className="sm:flex-1" />
          <Input
            name="description"
            placeholder="Description (optional)"
            className="sm:flex-1"
          />
        </div>
        <Button type="submit" className="shrink-0">
          Create
        </Button>
      </form>

      {collections.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          No collections yet. Create one above, then add reels from Search.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <div
              key={c.id}
              className="card group relative p-5 transition-colors hover:border-border-strong"
            >
              <Link href={`/collections/${c.id}`} className="block">
                <h2 className="font-semibold tracking-tight text-foreground">{c.name}</h2>
                {c.description && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">
                    {c.description}
                  </p>
                )}
                <p className="mt-4 label-caps">
                  {c._count.reels} reel{c._count.reels === 1 ? "" : "s"}
                </p>
              </Link>
              <form
                action={deleteCollection.bind(null, c.id)}
                className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <button
                  type="submit"
                  aria-label="Delete collection"
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-muted hover:text-danger"
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </ReaderPage>
  );
}
