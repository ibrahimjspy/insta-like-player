import Link from "next/link";
import { notFound } from "next/navigation";

import { ReelGrid } from "@/components/ReelGrid";
import { ReaderPage } from "@/components/ui/PageHeader";
import { getCollection } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection) notFound();

  const reels = collection.reels.map((r) => r.reel);

  return (
    <ReaderPage>
      <Link
        href="/collections"
        className="inline-flex items-center text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        ← Collections
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {collection.name}
      </h1>
      {collection.description && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {collection.description}
        </p>
      )}
      <p className="mt-2 label-caps">
        {reels.length} reel{reels.length === 1 ? "" : "s"}
      </p>
      <div className="mt-8">
        <ReelGrid reels={reels} removeFromCollectionId={collection.id} />
      </div>
    </ReaderPage>
  );
}
