import type { ParsedLike } from "@/lib/platforms/types";

const VIDEO_ID_RE =
  /(?:tiktok\.com\/(?:@[\w.-]+\/video|share\/video)|tiktokv\.com\/share\/video|m\.tiktok\.com\/v)\/(\d+)/i;

/// Extracts the numeric TikTok video id from common URL shapes.
export function extractTikTokVideoId(url: string): string | null {
  const match = url.match(VIDEO_ID_RE);
  return match ? match[1] : null;
}

/// Normalises share/mobile URLs into a canonical form yt-dlp accepts.
export function normalizeTikTokUrl(href: string): string {
  const id = extractTikTokVideoId(href);
  if (!id) return href.split(/[?#]/)[0];
  const handle = extractTikTokHandle(href);
  return `https://www.tiktok.com/@${handle}/video/${id}`;
}

function extractTikTokHandle(href: string): string {
  const match = href.match(/tiktok\.com\/@([\w.-]+)/i);
  return match ? match[1] : "user";
}

function parseTikTokDate(value: string): Date | null {
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

interface TikTokListItem {
  Date?: string;
  Link?: string;
  date?: string;
  link?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function collectTikTokListItems(raw: unknown): TikTokListItem[] {
  const root = asRecord(raw);
  if (!root) return [];

  // TikTok nests the "Like List" under different top-level containers depending
  // on the export vintage: "Likes and Favorites" (web/JSON) or "Activity".
  const containers = [
    root,
    asRecord(root["Likes and Favorites"]),
    asRecord(root.Activity),
  ].filter(Boolean) as Record<string, unknown>[];

  for (const container of containers) {
    for (const key of ["Like List", "like_list", "likes", "Likes"]) {
      const block = container[key];
      if (Array.isArray(block)) return block as TikTokListItem[];
      const list = asRecord(block)?.ItemFavoriteList;
      if (Array.isArray(list)) return list as TikTokListItem[];
    }
  }

  return [];
}

/// Parses TikTok's JSON data export (request "Likes" in the mobile app export).
export function parseTikTokLikes(raw: unknown): ParsedLike[] {
  const items = collectTikTokListItems(raw);
  const likes: ParsedLike[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const href = item.Link ?? item.link;
    if (!href || typeof href !== "string") continue;

    const shortcode = extractTikTokVideoId(href);
    if (!shortcode || seen.has(shortcode)) continue;
    seen.add(shortcode);

    const dateStr = item.Date ?? item.date;
    likes.push({
      platform: "TIKTOK",
      shortcode,
      reelUrl: normalizeTikTokUrl(href),
      creatorUsername: extractTikTokHandle(href) === "user" ? null : extractTikTokHandle(href),
      likedAt: typeof dateStr === "string" ? parseTikTokDate(dateStr) : null,
      caption: null,
    });
  }

  return likes;
}

/// TikTok liked URLs in exports are always videos.
export function isTikTokVideoUrl(url: string): boolean {
  return extractTikTokVideoId(url) !== null;
}
