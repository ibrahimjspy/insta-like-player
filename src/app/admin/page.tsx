import Link from "next/link";

import { ImportPanel } from "@/components/admin/ImportPanel";
import { SyncPanel } from "@/components/admin/SyncPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { getLibraryStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STAT_CARDS = [
  { key: "downloaded", label: "Downloaded", highlight: true },
  { key: "pending", label: "Pending" },
  { key: "total", label: "In library" },
  { key: "failed", label: "Failed" },
  { key: "unavailable", label: "Unavailable" },
  { key: "favorites", label: "Favorites" },
  { key: "creators", label: "Creators" },
  { key: "collections", label: "Collections" },
] as const;

export default async function AdminDashboard() {
  const stats = await getLibraryStats();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description="Import likes from Instagram, TikTok, or Facebook, then sync media into your private library on this machine."
      />

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="label-caps mb-3">
          Library overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STAT_CARDS.map((card) => (
            <StatCard
              key={card.key}
              value={stats[card.key]}
              label={card.label}
              highlight={"highlight" in card && card.highlight}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="workflow-heading" className="space-y-4">
        <h2 id="workflow-heading" className="label-caps">
          Workflow
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ImportPanel />
          <SyncPanel pendingCount={stats.pending} />
        </div>
      </section>

      {stats.failed > 0 && (
        <p className="rounded-lg border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger">
          {stats.failed} reel{stats.failed === 1 ? "" : "s"} failed to download.{" "}
          <Link
            href="/admin/reels?status=FAILED"
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            Review in Reels
          </Link>
        </p>
      )}
    </div>
  );
}
