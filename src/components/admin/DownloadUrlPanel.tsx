"use client";

import type { Platform } from "@prisma/client";
import { CheckCircle2, ClipboardPaste, Link2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PlatformBadge } from "@/components/PlatformBadge";
import { Button } from "@/components/ui/Button";

interface DownloadUrlResult {
  platform: Platform;
  shortcode: string;
  reelUrl: string;
  status: "DOWNLOADED" | "FAILED" | "UNAVAILABLE";
  alreadyDownloaded: boolean;
  message?: string;
}

interface DownloadUrlJobState {
  running: boolean;
  currentUrl: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  queueLength: number;
  lastEvent: string | null;
  result: DownloadUrlResult | null;
  error: string | null;
  recent: DownloadUrlResult[];
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

export function DownloadUrlPanel() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pasting, setPasting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [state, setState] = useState<DownloadUrlJobState | null>(null);
  const wasBusy = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const poll = useCallback(async () => {
    const res = await fetch("/api/admin/download-url", { cache: "no-store" });
    const data = (await res.json()) as DownloadUrlJobState;
    setState(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const data = await poll();
      if (cancelled) return;
      const busy = data.running || data.queueLength > 0;
      if (wasBusy.current && !busy) router.refresh();
      wasBusy.current = busy;
    };
    void tick();
    const interval = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poll, router]);

  const enqueue = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setSubmitError("Paste or type a video URL first.");
      return;
    }

    setSubmitError(null);
    setUrl("");
    try {
      const res = await fetch("/api/admin/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not queue download");
      setState(data as DownloadUrlJobState);
      wasBusy.current = true;
      inputRef.current?.focus();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not queue download");
      setUrl(trimmed);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await enqueue(url);
  };

  const pasteAndDownload = async () => {
    if (!navigator.clipboard?.readText) {
      setSubmitError("Clipboard paste isn’t available here — paste into the field, then press Add.");
      inputRef.current?.focus();
      return;
    }

    setPasting(true);
    setSubmitError(null);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setSubmitError("Clipboard is empty.");
        return;
      }
      if (!looksLikeUrl(text)) {
        setUrl(text);
        setSubmitError("Clipboard doesn’t look like a URL. Check it, then press Add.");
        return;
      }
      await enqueue(text);
    } catch {
      setSubmitError("Couldn’t read the clipboard. Paste into the field, then press Add.");
      inputRef.current?.focus();
    } finally {
      setPasting(false);
    }
  };

  const busy = Boolean(state?.running || (state && state.queueLength > 0));
  const recent = state?.recent ?? [];

  return (
    <section className="card-elevated flex flex-col p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-background text-foreground-secondary sm:h-10 sm:w-10">
          <Link2 size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Quick add</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Add one video by URL</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Paste a link — download runs in the background with the same{" "}
            <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">
              yt-dlp
            </code>{" "}
            cookies as sync.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        <div className="rounded-xl border border-border-strong bg-background p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-foreground/25 focus-within:ring-2 focus-within:ring-ring/25">
          <label htmlFor="quick-add-url" className="sr-only">
            Video URL
          </label>
          <input
            ref={inputRef}
            id="quick-add-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (submitError) setSubmitError(null);
            }}
            placeholder="https://www.instagram.com/reel/…"
            className="h-12 w-full rounded-lg bg-transparent px-3.5 font-mono text-[13px] leading-none text-foreground outline-none placeholder:text-muted-subtle sm:text-sm"
          />
          <div className="flex gap-1.5 p-0.5 pt-0">
            <Button
              type="button"
              variant="secondary"
              onClick={pasteAndDownload}
              disabled={pasting}
              className="min-w-0 flex-1"
            >
              <ClipboardPaste size={15} strokeWidth={1.75} />
              {pasting ? "Reading…" : "Paste & download"}
            </Button>
            <Button type="submit" disabled={!url.trim()} className="shrink-0 px-5">
              Add
            </Button>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Instagram <code className="font-mono">/reel/</code>, <code className="font-mono">/p/</code>,
          TikTok, and Facebook links work. Photo-only posts may fail.
        </p>
      </form>

      {submitError && (
        <p className="mt-4 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-sm text-danger">
          {submitError}
        </p>
      )}

      {busy && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-info/20 bg-info-muted px-3.5 py-3">
          <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-info" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Downloading in background</p>
            <p className="mt-0.5 truncate font-mono text-xs text-muted">
              {state?.lastEvent ?? "Starting…"}
              {state && state.queueLength > 0 ? ` · ${state.queueLength} queued` : ""}
            </p>
          </div>
        </div>
      )}

      {!busy && state?.error && (
        <p className="mt-4 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      {recent.length > 0 && (
        <ul className="mt-4 space-y-2">
          {recent.slice(0, 4).map((item, i) => {
            const ok = item.status === "DOWNLOADED";
            return (
              <li
                key={`${item.platform}-${item.shortcode}-${i}`}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                  ok
                    ? "border-border bg-background-subtle text-muted"
                    : "border-danger/20 bg-danger-muted text-danger"
                }`}
              >
                {ok ? (
                  <CheckCircle2 size={15} className="shrink-0 text-success" strokeWidth={1.75} />
                ) : (
                  <XCircle size={15} className="shrink-0" strokeWidth={1.75} />
                )}
                <PlatformBadge platform={item.platform} verbose />
                <span className="min-w-0 truncate font-mono text-xs">{item.shortcode}</span>
                <span className="ml-auto shrink-0 text-xs">
                  {item.alreadyDownloaded
                    ? "already had"
                    : ok
                      ? "downloaded"
                      : item.status.toLowerCase()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
