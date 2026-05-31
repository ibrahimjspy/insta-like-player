import { ReelStatus } from "@prisma/client";
import Link from "next/link";

import { deleteReel, retryReel } from "@/app/admin/actions";
import { getAdminReels } from "@/lib/queries";

export const dynamic = "force-dynamic";

const STATUSES: (ReelStatus | "ALL")[] = [
  "ALL",
  "PENDING",
  "DOWNLOADED",
  "FAILED",
  "UNAVAILABLE",
  "SKIPPED",
];

const STATUS_STYLES: Record<ReelStatus, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-400",
  DOWNLOADED: "bg-green-500/15 text-green-400",
  FAILED: "bg-red-500/15 text-red-400",
  UNAVAILABLE: "bg-zinc-500/15 text-zinc-400",
  SKIPPED: "bg-zinc-500/15 text-zinc-400",
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
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Reels</h1>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => {
          const activeStatus = sp.status ?? "ALL";
          return (
            <Link
              key={s}
              href={buildQuery({ status: s === "ALL" ? undefined : s, page: 1 })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                activeStatus === s
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {s}
            </Link>
          );
        })}
      </div>

      <form action="/admin/reels" className="flex gap-2">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search caption, shortcode, creator…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-surface-2 px-4 py-2 text-sm hover:bg-border"
        >
          Search
        </button>
      </form>

      <p className="text-sm text-muted">{total} reels</p>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Reel</th>
              <th className="px-4 py-3">Creator</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((reel) => (
              <tr key={reel.id} className="border-t border-border align-top">
                <td className="max-w-xs px-4 py-3">
                  <a
                    href={reel.reelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-accent hover:underline"
                  >
                    {reel.shortcode}
                  </a>
                  {reel.caption && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{reel.caption}</p>
                  )}
                  {reel.failReason && reel.status === "FAILED" && (
                    <p className="mt-1 line-clamp-2 text-xs text-red-400/80">
                      {reel.failReason}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {reel.creator ? `@${reel.creator.username}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[reel.status]}`}
                  >
                    {reel.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3 text-xs">
                    {reel.status !== "DOWNLOADED" && (
                      <form action={retryReel.bind(null, reel.id)}>
                        <button type="submit" className="text-accent hover:underline">
                          Retry
                        </button>
                      </form>
                    )}
                    <form action={deleteReel.bind(null, reel.id)}>
                      <button type="submit" className="text-muted hover:text-red-400">
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  No reels match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={buildQuery({ page: Math.max(1, page - 1) })}
            className={`rounded-lg border border-border px-3 py-1.5 ${
              page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-2"
            }`}
          >
            ← Prev
          </Link>
          <span className="text-muted">
            Page {page} of {pageCount}
          </span>
          <Link
            href={buildQuery({ page: Math.min(pageCount, page + 1) })}
            className={`rounded-lg border border-border px-3 py-1.5 ${
              page >= pageCount ? "pointer-events-none opacity-40" : "hover:bg-surface-2"
            }`}
          >
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}
