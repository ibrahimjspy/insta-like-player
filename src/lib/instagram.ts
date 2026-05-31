/// Helpers for parsing Instagram URLs and captions.

const SHORTCODE_RE = /instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

/// Extracts the shortcode (e.g. "ABC123") from any Instagram post/reel URL.
/// Returns null if the URL isn't a recognisable Instagram media link.
export function extractShortcode(url: string): string | null {
  const match = url.match(SHORTCODE_RE);
  return match ? match[1] : null;
}

/// Normalises a reel URL to a canonical form so duplicates dedupe cleanly.
export function canonicalReelUrl(shortcode: string): string {
  return `https://www.instagram.com/reel/${shortcode}/`;
}

/// Parses hashtags from a caption, lower-cased and without the leading '#'.
export function parseHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const unique = new Set(tags.map((t) => t.slice(1).toLowerCase()));
  return [...unique];
}
