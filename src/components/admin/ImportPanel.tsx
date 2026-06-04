"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

interface ImportResult {
  parsed: number;
  imported: number;
  updated: number;
  skippedUnparseable: number;
}

export function ImportPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult(data as ImportResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-elevated p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted">
          <Upload size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Step 1</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Import likes</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Upload{" "}
            <code className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-xs text-foreground-secondary">
              liked_posts.json
            </code>{" "}
            from your Instagram data export.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          required
          className="text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-elevated file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground-secondary hover:file:bg-surface-hover"
        />
        <Button type="submit" disabled={busy} size="md">
          {busy ? "Importing…" : "Import file"}
        </Button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/20 bg-danger-muted px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {result && (
        <p className="mt-4 rounded-lg border border-border bg-background-subtle px-3 py-2 text-sm text-muted">
          Parsed {result.parsed} ·{" "}
          <span className="text-foreground">{result.imported}</span> new · {result.updated}{" "}
          updated. Run sync below to download media.
        </p>
      )}
    </section>
  );
}
