/// Helpers for parsing Instagram URLs and captions.

import type { Prisma } from "@prisma/client";

const SHORTCODE_RE = /instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;
const TYPE_RE = /instagram\.com\/(reel|reels|p|tv)\//i;

/// The kind of liked media, inferred from its URL path.
/// - `reel` / `igtv` are always videos
/// - `post` (`/p/`) is generic: a photo, a carousel, OR a video
export type PostType = "reel" | "post" | "igtv" | "unknown";

/// Extracts the shortcode (e.g. "ABC123") from any Instagram post/reel URL.
/// Returns null if the URL isn't a recognisable Instagram media link.
export function extractShortcode(url: string): string | null {
  const match = url.match(SHORTCODE_RE);
  return match ? match[1] : null;
}

/// Strips query string / fragment so we store a clean, canonical link while
/// preserving the original path type (/reel/, /p/, /tv/).
export function normalizeInstagramUrl(href: string): string {
  return href.split(/[?#]/)[0];
}

/// Classifies a media URL by its path type.
export function postTypeFromUrl(url: string): PostType {
  const match = url.match(TYPE_RE);
  if (!match) return "unknown";
  const t = match[1].toLowerCase();
  if (t === "reel" || t === "reels") return "reel";
  if (t === "tv") return "igtv";
  return "post";
}

/// True when the URL path is always video (reel or IGTV), not a generic `/p/` post.
export function isSureShotVideoUrl(url: string): boolean {
  const t = postTypeFromUrl(url);
  return t === "reel" || t === "igtv";
}

/// Prisma filter: rows whose stored URL is a reel or IGTV link.
export const sureShotReelUrlWhere = {
  OR: [
    { reelUrl: { contains: "/reel/" } },
    { reelUrl: { contains: "/reels/" } },
    { reelUrl: { contains: "/tv/" } },
  ],
} satisfies Prisma.ReelWhereInput;

/// Parses hashtags from a caption, lower-cased and without the leading '#'.
export function parseHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const unique = new Set(tags.map((t) => t.slice(1).toLowerCase()));
  return [...unique];
}
