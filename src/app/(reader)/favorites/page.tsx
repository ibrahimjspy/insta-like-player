import { ReelFeed } from "@/components/ReelFeed";
import { getFavorites } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const favorites = await getFavorites();

  return (
    <ReelFeed
      initialItems={favorites}
      initialCursor={null}
      order="recent"
      paginate={false}
      emptyTitle="No favorites yet"
      emptyHint="Tap the heart on any reel in the feed to save it here."
    />
  );
}
