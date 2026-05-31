import Link from "next/link";

import { ImportPanel } from "@/components/admin/ImportPanel";
import { SyncPanel } from "@/components/admin/SyncPanel";
import { getLibraryStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STAT_CARDS = [
  { key: "total", label: "Total reels" },
  { key: "downloaded", label: "Downloaded" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "unavailable", label: "Unavailable" },
  { key: "favorites", label: "Favorites" },
  { key: "creators", label: "Creators" },
  { key: "collections", label: "Collections" },
] as const;

export default async function AdminDashboard() {
  const stats = await getLibraryStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Import your liked reels, then download the media to build your library.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-2xl font-bold">{stats[card.key]}</p>
            <p className="text-xs text-muted">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ImportPanel />
        <SyncPanel pendingCount={stats.pending} />
      </div>

      {stats.failed > 0 && (
        <p className="text-sm text-muted">
          {stats.failed} reel{stats.failed === 1 ? "" : "s"} failed to download.{" "}
          <Link href="/admin/reels?status=FAILED" className="text-accent underline">
            Review them
          </Link>
          .
        </p>
      )}
    </div>
  );
}
