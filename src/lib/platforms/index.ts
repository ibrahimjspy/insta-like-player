import type { Platform } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { parseFacebookLikes, isFacebookVideoUrl } from "@/lib/platforms/facebook";
import { parseTikTokLikes, isTikTokVideoUrl } from "@/lib/platforms/tiktok";
import type { ParsedLike } from "@/lib/platforms/types";
import {
  PLATFORM_LABEL,
  PLATFORM_SLUG,
  mediaStorageKey,
  openOnPlatformLabel,
  platformFromSlug,
} from "@/lib/platforms/types";
import {
  extractShortcode,
  isSureShotVideoUrl,
  normalizeInstagramUrl,
  parseHashtags,
  postTypeFromUrl,
  sureShotReelUrlWhere,
} from "@/lib/instagram";

export type { ParsedLike, Platform };
export {
  PLATFORM_LABEL,
  PLATFORM_SLUG,
  mediaStorageKey,
  openOnPlatformLabel,
  platformFromSlug,
};
export { parseHashtags };

export const PLATFORMS: Platform[] = ["INSTAGRAM", "TIKTOK", "FACEBOOK"];

export function parseExport(platform: Platform, raw: unknown): ParsedLike[] {
  switch (platform) {
    case "INSTAGRAM":
      return parseInstagramLikes(raw);
    case "TIKTOK":
      return parseTikTokLikes(raw);
    case "FACEBOOK":
      return parseFacebookLikes(raw);
  }
}

/// Instagram parser (moved from ingest.ts so ingest stays platform-agnostic).
export function parseInstagramLikes(raw: unknown): ParsedLike[] {
  const root = raw as Record<string, unknown>;
  const entries =
    (root?.likes_media_likes as unknown[]) ??
    (root?.likes as unknown[]) ??
    (Array.isArray(raw) ? (raw as unknown[]) : []);

  const likes: ParsedLike[] = [];

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;

    if (Array.isArray(e?.label_values)) {
      const like = parseInstagramLabelValueEntry(e);
      if (like) likes.push(like);
      continue;
    }

    const title = typeof e.title === "string" ? e.title : null;
    const list = (e.string_list_data as Record<string, unknown>[]) ?? [];
    for (const item of list) {
      const href = typeof item.href === "string" ? item.href : null;
      const shortcode = href ? extractShortcode(href) : null;
      if (!shortcode) continue;
      const ts = typeof item.timestamp === "number" ? item.timestamp : null;
      likes.push({
        platform: "INSTAGRAM",
        shortcode,
        reelUrl: normalizeInstagramUrl(href!),
        creatorUsername: title,
        likedAt: ts ? new Date(ts * 1000) : null,
        caption: null,
      });
    }
  }

  return likes;
}

interface LabelValue {
  label?: string;
  value?: string;
  href?: string;
  title?: string;
  dict?: { dict?: LabelValue[] }[];
}

function parseInstagramLabelValueEntry(entry: Record<string, unknown>): ParsedLike | null {
  const values = (entry.label_values as LabelValue[]) ?? [];

  const urlItem = values.find((v) => v.label === "URL" && (v.href || v.value));
  const href = urlItem?.href || urlItem?.value;
  if (!href) return null;
  const shortcode = extractShortcode(href);
  if (!shortcode) return null;

  const caption = values.find((v) => v.label === "Caption")?.value ?? null;

  let creatorUsername: string | null = null;
  const owner = values.find((v) => v.title === "Owner");
  for (const group of owner?.dict ?? []) {
    const username = group.dict?.find((d) => d.label === "Username")?.value;
    if (username) {
      creatorUsername = username;
      break;
    }
  }

  const ts = typeof entry.timestamp === "number" ? entry.timestamp : null;

  return {
    platform: "INSTAGRAM",
    shortcode,
    reelUrl: normalizeInstagramUrl(href),
    creatorUsername,
    likedAt: ts ? new Date(ts * 1000) : null,
    caption: caption || null,
  };
}

export function isSureShotVideo(platform: Platform, url: string): boolean {
  switch (platform) {
    case "INSTAGRAM":
      return isSureShotVideoUrl(url);
    case "TIKTOK":
      return isTikTokVideoUrl(url);
    case "FACEBOOK":
      return isFacebookVideoUrl(url);
  }
}

export function sureShotVideoWhere(platform?: Platform): Prisma.ReelWhereInput {
  if (!platform) {
    return {
      OR: [
        { platform: "INSTAGRAM", ...sureShotReelUrlWhere },
        { platform: "TIKTOK" },
        {
          platform: "FACEBOOK",
          OR: [
            { reelUrl: { contains: "/reel/" } },
            { reelUrl: { contains: "/watch" } },
            { reelUrl: { contains: "fb.watch" } },
            { reelUrl: { contains: "video.php" } },
          ],
        },
      ],
    };
  }

  if (platform === "INSTAGRAM") {
    return { platform: "INSTAGRAM", ...sureShotReelUrlWhere };
  }
  if (platform === "TIKTOK") {
    return { platform: "TIKTOK" };
  }
  return {
    platform: "FACEBOOK",
    OR: [
      { reelUrl: { contains: "/reel/" } },
      { reelUrl: { contains: "/watch" } },
      { reelUrl: { contains: "fb.watch" } },
      { reelUrl: { contains: "video.php" } },
    ],
  };
}

export function postTypeLabel(platform: Platform, url: string): string {
  if (platform === "INSTAGRAM") {
    const labels: Record<string, string> = {
      reel: "Reel",
      igtv: "IGTV",
      post: "Post",
      unknown: "?",
    };
    return labels[postTypeFromUrl(url)] ?? "?";
  }
  if (platform === "TIKTOK") return "Video";
  if (url.includes("/reel/")) return "Reel";
  return "Video";
}

export function exportHint(platform: Platform): string {
  switch (platform) {
    case "INSTAGRAM":
      return "liked_posts.json";
    case "TIKTOK":
      return "user_data_tiktok.json (include Likes)";
    case "FACEBOOK":
      return "likes_and_reactions/posts_and_comments.json";
  }
}
