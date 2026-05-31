import { promises as fs } from "node:fs";
import path from "node:path";

import { config } from "@/lib/config";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/// Maps a filename to a MIME type, falling back to a generic binary type.
export function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/// Resolves a stored media filename to an absolute path, guarding against
/// path traversal. Returns null if the name escapes the media directory.
export function resolveMediaPath(filename: string): string | null {
  const resolved = path.resolve(config.mediaDir, filename);
  const root = path.resolve(config.mediaDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

export type ByteRange =
  | { kind: "ok"; start: number; end: number }
  | { kind: "unsatisfiable" };

/// Parses an HTTP `Range` header against a known file size. Returns the
/// clamped byte range, `unsatisfiable` (caller should send 416), or null when
/// the header isn't a byte range (caller should send the full file). Pure so
/// the range/seek logic is unit-tested without a live request.
export function parseByteRange(rangeHeader: string, size: number): ByteRange | null {
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (!match) return null;

  const start = match[1] ? parseInt(match[1], 10) : 0;
  const requestedEnd = match[2] ? parseInt(match[2], 10) : size - 1;
  const end = Math.min(requestedEnd, size - 1);

  if (Number.isNaN(start) || start > end || start >= size || start < 0) {
    return { kind: "unsatisfiable" };
  }
  return { kind: "ok", start, end };
}

/// Best-effort deletion of stored media files (video/thumbnail). Ignores
/// missing files and names that resolve outside the media directory. Shared by
/// the reader and admin delete/skip actions.
export async function deleteMediaFiles(
  filenames: Array<string | null | undefined>,
): Promise<void> {
  for (const name of filenames) {
    if (!name) continue;
    const abs = resolveMediaPath(name);
    if (abs) await fs.unlink(abs).catch(() => undefined);
  }
}
