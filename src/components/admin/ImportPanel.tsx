"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface ImportResult {
  parsed: number;
  imported: number;
  skippedDuplicates: number;
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
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-semibold">1 · Import likes</h2>
      <p className="mt-1 text-sm text-muted">
        Upload the <code className="text-foreground">liked_posts.json</code> from your Instagram
        data export (Settings → Accounts Center → Your information → Download your information →
        Likes, JSON).
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          required
          className="text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:text-foreground hover:file:bg-border"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      {result && (
        <p className="mt-3 text-sm text-muted">
          Parsed {result.parsed}, imported{" "}
          <span className="text-foreground">{result.imported}</span> new,{" "}
          {result.skippedDuplicates} duplicates skipped. Now run a sync below.
        </p>
      )}
    </section>
  );
}
