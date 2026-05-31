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

/// Public URL for a reel's video stream (served by the media route handler).
export function videoUrl(shortcode: string): string {
  return `/api/media/video/${shortcode}`;
}

/// Public URL for a reel's thumbnail.
export function thumbUrl(shortcode: string): string {
  return `/api/media/thumb/${shortcode}`;
}
