"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface SyncState {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  progress: { index: number; total: number } | null;
  lastEvent: string | null;
  summary: { total: number; downloaded: number; failed: number; unavailable: number } | null;
  error: string | null;
}

export function SyncPanel({ pendingCount }: { pendingCount: number }) {
  const router = useRouter();
  const [state, setState] = useState<SyncState | null>(null);
  const [includeFailed, setIncludeFailed] = useState(false);

  const wasRunning = useRef(false);

  const poll = useCallback(async () => {
    const res = await fetch("/api/admin/sync", { cache: "no-store" });
    const data = (await res.json()) as SyncState;
    setState(data);
    return data;
  }, []);

  // Poll the sync status on an interval; when a run finishes, refresh the
  // server-rendered stats. setState happens after an awaited fetch, so this is
  // not a synchronous-in-effect update.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const data = await poll();
      if (cancelled) return;
      if (wasRunning.current && !data.running) router.refresh();
      wasRunning.current = data.running;
    };
    void tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poll, router]);

  const start = async () => {
    await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeFailed }),
    });
    await poll();
  };

  const progress = state?.progress;
  const pct = progress && progress.total > 0 ? (progress.index / progress.total) * 100 : 0;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">2 · Download media</h2>
      <p className="mt-1 text-sm text-muted">
        Runs <code className="text-foreground">yt-dlp</code> for each pending reel. Make sure it&apos;s
        installed (<code className="text-foreground">brew install yt-dlp</code>). You can also run{" "}
        <code className="text-foreground">npm run sync</code> in a terminal.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          disabled={state?.running}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {state?.running ? "Syncing…" : `Sync ${pendingCount} pending`}
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeFailed}
            onChange={(e) => setIncludeFailed(e.target.checked)}
            disabled={state?.running}
          />
          Retry failed too
        </label>
      </div>

      {state?.running && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-2 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {progress ? `${progress.index} / ${progress.total}` : "Starting…"} · {state.lastEvent}
          </p>
        </div>
      )}

      {state && !state.running && state.summary && (
        <p className="mt-3 text-sm text-muted">
          Last run: downloaded{" "}
          <span className="text-foreground">{state.summary.downloaded}</span>, failed{" "}
          {state.summary.failed}, unavailable {state.summary.unavailable}.
        </p>
      )}
      {state?.error && <p className="mt-3 text-sm text-accent">{state.error}</p>}
    </section>
  );
}
