import { ReelStatus } from "@prisma/client";
import Link from "next/link";

import { deleteReel, retryReel } from "@/app/admin/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FilterPill } from "@/components/ui/FilterPill";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { postTypeFromUrl } from "@/lib/instagram";
import { getAdminReels } from "@/lib/queries";

const TYPE_LABELS: Record<string, string> = {
  reel: "Reel",
  igtv: "IGTV",
  post: "Post",
  unknown: "?",
};

export const dynamic = "force-dynamic";

const STATUSES: (ReelStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "DOWNLOADED",
  "FAILED",
  "UNAVAILABLE",
  "SKIPPED",
];

const STATUS_TONE: Record<ReelStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING: "warning",
  DOWNLOADED: "success",
  FAILED: "danger",
  UNAVAILABLE: "neutral",
  SKIPPED: "neutral",
};

export default async function AdminReelsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status =
    sp.status && sp.status !== "ALL" && sp.status in ReelStatus
      ? (sp.status as ReelStatus)
      : undefined;
  const page = Number(sp.page ?? "1") || 1;

  const { items, total, pageCount } = await getAdminReels({
    status,
    query: sp.q,
    page,
  });

  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status: sp.status, q: sp.q, page, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== "" && v !== null) params.set(k, String(v));
    }
    return `/admin/reels?${params.toString()}`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reels"
        description={`${total} items in your library index.`}
      />

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            href={buildQuery({ status: s === "ALL" ? undefined : s, page: 1 })}
            active={(sp.status ?? "ALL") === s}
          >
            {s}
          </FilterPill>
        ))}
      </div>

      <form action="/admin/reels" className="flex flex-col gap-2 sm:flex-row">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <Input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search caption, shortcode, creator…"
          className="flex-1"
        />
        <Button type="submit" variant="secondary" className="shrink-0 sm:w-auto">
          Search
        </Button>
      </form>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated text-left">
                <th className="label-caps px-4 py-3">Reel</th>
                <th className="label-caps px-4 py-3">Type</th>
                <th className="label-caps px-4 py-3">Creator</th>
                <th className="label-caps px-4 py-3">Status</th>
                <th className="label-caps px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((reel) => (
                <tr
                  key={reel.id}
                  className="border-b border-border align-top transition-colors last:border-0 hover:bg-surface-hover/50"
                >
                  <td className="max-w-xs px-4 py-3.5">
                    <a
                      href={reel.reelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-foreground-secondary underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {reel.shortcode}
                    </a>
                    {reel.caption && (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
                        {reel.caption}
                      </p>
                    )}
                    {reel.failReason && reel.status === "FAILED" && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-danger/90">
                        {reel.failReason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={postTypeFromUrl(reel.reelUrl) === "post" ? "warning" : "info"}>
                      {TYPE_LABELS[postTypeFromUrl(reel.reelUrl)]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 text-muted">
                    {reel.creator ? `@${reel.creator.username}` : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge tone={STATUS_TONE[reel.status]}>{reel.status}</Badge>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      {reel.status !== "DOWNLOADED" && (
                        <form action={retryReel.bind(null, reel.id)}>
                          <Button type="submit" variant="ghost" size="sm">
                            Retry
                          </Button>
                        </form>
                      )}
                      <form action={deleteReel.bind(null, reel.id)}>
                        <Button type="submit" variant="danger" size="sm">
                          Delete
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-muted">
                    No reels match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-4">
          {page <= 1 ? (
            <span className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted opacity-40">
              Previous
            </span>
          ) : (
            <Link
              href={buildQuery({ page: page - 1 })}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-surface-elevated px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
            >
              Previous
            </Link>
          )}
          <span className="text-sm tabular-nums text-muted">
            Page {page} of {pageCount}
          </span>
          {page >= pageCount ? (
            <span className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted opacity-40">
              Next
            </span>
          ) : (
            <Link
              href={buildQuery({ page: page + 1 })}
              className="inline-flex h-8 items-center rounded-lg border border-border bg-surface-elevated px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
            >
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
