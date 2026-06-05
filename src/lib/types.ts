import type { Platform } from "@prisma/client";

import { PLATFORM_SLUG } from "@/lib/platforms/types";

export type { Platform };

/// Client-facing reel shape. Kept free of server-only imports so it can be
/// shared with client components without pulling Prisma into the browser
/// bundle. Note: file paths are intentionally omitted — the browser only ever
/// references media through the /api/media/<type>/<platform>/<shortcode> routes.
export interface ReelView {
  id: string;
  platform: Platform;
  shortcode: string;
  reelUrl: string;
  caption: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  likedAt: string | Date | null;
  isFavorite: boolean;
  creator: { username: string; platform: Platform } | null;
}

export function videoSrc(platform: Platform, shortcode: string): string {
  return `/api/media/video/${PLATFORM_SLUG[platform]}/${shortcode}`;
}

export function thumbSrc(platform: Platform, shortcode: string): string {
  return `/api/media/thumb/${PLATFORM_SLUG[platform]}/${shortcode}`;
}
