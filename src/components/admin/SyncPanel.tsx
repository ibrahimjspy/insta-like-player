"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

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
    <section className="card-elevated p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted">
          <Download size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Step 2</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Download media</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Uses{" "}
            <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">
              yt-dlp
            </code>{" "}
            locally with per-platform cookie files. CLI:{" "}
            <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">
              npm run sync
            </code>
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="button" onClick={start} disabled={state?.running}>
          {state?.running ? "Syncing…" : `Sync ${pendingCount} pending`}
        </Button>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeFailed}
            onChange={(e) => setIncludeFailed(e.target.checked)}
            disabled={state?.running}
            className="h-4 w-4 rounded border-border bg-surface-elevated accent-foreground"
          />
          Include failed reels
        </label>
      </div>

      {state?.running && (
        <div className="mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 font-mono text-xs text-muted">
            {progress ? `${progress.index} / ${progress.total}` : "Starting…"}
            {state.lastEvent ? ` · ${state.lastEvent}` : ""}
          </p>
        </div>
      )}

      {state && !state.running && state.summary && (
        <p className="mt-4 rounded-lg border border-border bg-background-subtle px-3 py-2 text-sm text-muted">
          Last run — downloaded{" "}
          <span className="text-foreground">{state.summary.downloaded}</span>, failed{" "}
          {state.summary.failed}, unavailable {state.summary.unavailable}.
        </p>
      )}
      {state?.error && (
        <p className="mt-4 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
    </section>
  );
}
