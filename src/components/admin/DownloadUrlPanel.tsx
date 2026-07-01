"use client";

import type { Platform } from "@prisma/client";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PlatformBadge } from "@/components/PlatformBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface DownloadUrlResult {
  platform: Platform;
  shortcode: string;
  reelUrl: string;
  status: "DOWNLOADED" | "FAILED" | "UNAVAILABLE";
  alreadyDownloaded: boolean;
  message?: string;
}

export function DownloadUrlPanel() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [result, setResult] = useState<DownloadUrlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Download failed");
      setResult(data as DownloadUrlResult);
      if ((data as DownloadUrlResult).status === "DOWNLOADED") {
        setUrl("");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setError("Paste is not available in this browser. Paste the URL into the field.");
      return;
    }

    setPasting(true);
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text.trim());
    } catch {
      setError("Could not read your clipboard. Paste the URL into the field.");
    } finally {
      setPasting(false);
    }
  };

  return (
    <section className="card-elevated p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted sm:h-10 sm:w-10">
          <Link2 size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Quick add</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Add one video by URL</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Paste a copied Instagram, TikTok, or Facebook link and download it immediately with the same{" "}
            <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">
              yt-dlp
            </code>{" "}
            cookie setup used by sync.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/p/..."
            disabled={busy}
            required
            mono
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={pasteFromClipboard}
            disabled={busy || pasting}
            className="w-full sm:w-auto"
          >
            {pasting ? "Pasting..." : "Paste"}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Instagram share links using <code className="font-mono">/reel/</code>,{" "}
          <code className="font-mono">/reels/</code>, <code className="font-mono">/p/</code>, or{" "}
          <code className="font-mono">/tv/</code> are accepted. Photo-only posts may fail during
          download.
        </p>
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Downloading..." : "Download video"}
        </Button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {result && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            result.status === "DOWNLOADED"
              ? "border-border bg-background-subtle text-muted"
              : "border-danger/20 bg-danger-muted text-danger"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <PlatformBadge platform={result.platform} verbose />
            <span className="font-mono text-xs">{result.shortcode}</span>
            <span>
              {result.alreadyDownloaded
                ? "was already downloaded"
                : result.status === "DOWNLOADED"
                  ? "downloaded"
                  : result.status.toLowerCase()}
            </span>
          </div>
          {result.message && <p className="mt-2">{result.message}</p>}
        </div>
      )}
    </section>
  );
}
