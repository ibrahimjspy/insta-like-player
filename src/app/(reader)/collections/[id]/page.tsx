import Link from "next/link";
import { notFound } from "next/navigation";

import { ReelGrid } from "@/components/ReelGrid";
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
    <div className="h-full overflow-y-auto p-5 md:p-8">
      <Link href="/collections" className="text-sm text-muted hover:text-foreground">
        ← Collections
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{collection.name}</h1>
      {collection.description && (
        <p className="mt-1 text-sm text-muted">{collection.description}</p>
      )}
      <p className="mb-6 mt-2 text-sm text-muted">
        {reels.length} reel{reels.length === 1 ? "" : "s"}
      </p>
      <ReelGrid reels={reels} removeFromCollectionId={collection.id} />
    </div>
  );
}
