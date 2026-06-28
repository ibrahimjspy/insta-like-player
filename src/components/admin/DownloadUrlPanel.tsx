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

  return (
    <section className="card-elevated p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted">
          <Link2 size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Quick add</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Download by URL</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Paste a new Instagram Reel URL and download it immediately with the same{" "}
            <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">
              yt-dlp
            </code>{" "}
            cookie setup used by sync.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.instagram.com/reel/..."
          disabled={busy}
          required
          mono
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Downloading..." : "Download reel"}
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
