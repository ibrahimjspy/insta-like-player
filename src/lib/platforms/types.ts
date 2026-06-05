import type { Platform } from "@prisma/client";

export type { Platform };

/// Normalised like row produced by any platform export parser.
export interface ParsedLike {
  platform: Platform;
  shortcode: string;
  reelUrl: string;
  creatorUsername: string | null;
  likedAt: Date | null;
  caption: string | null;
}

export const PLATFORM_SLUG: Record<Platform, string> = {
  INSTAGRAM: "instagram",
  TIKTOK: "tiktok",
  FACEBOOK: "facebook",
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  FACEBOOK: "Facebook",
};

export function platformFromSlug(slug: string): Platform | null {
  const normalised = slug.toLowerCase();
  const entry = Object.entries(PLATFORM_SLUG).find(([, s]) => s === normalised);
  return entry ? (entry[0] as Platform) : null;
}

/// Filesystem prefix for yt-dlp output. Instagram keeps the legacy bare shortcode
/// so existing libraries don't need a media rename.
export function mediaStorageKey(platform: Platform, shortcode: string): string {
  if (platform === "INSTAGRAM") return shortcode;
  return `${platform.toLowerCase()}_${shortcode}`;
}

export function openOnPlatformLabel(platform: Platform): string {
  switch (platform) {
    case "INSTAGRAM":
      return "Open on Instagram";
    case "TIKTOK":
      return "Open on TikTok";
    case "FACEBOOK":
      return "Open on Facebook";
  }
}
