import { ReelGrid } from "@/components/ReelGrid";
import { getCollections, getFavorites } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const [favorites, collections] = await Promise.all([getFavorites(), getCollections()]);

  return (
    <div className="h-[100dvh] overflow-y-auto p-5 md:p-8">
      <h1 className="mb-1 text-2xl font-bold">Favorites</h1>
      <p className="mb-6 text-sm text-muted">
        {favorites.length} reel{favorites.length === 1 ? "" : "s"} you&apos;ve hearted.
      </p>
      <ReelGrid reels={favorites} collections={collections} />
    </div>
  );
}
