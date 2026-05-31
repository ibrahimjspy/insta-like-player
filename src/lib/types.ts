/// Client-facing reel shape. Kept free of server-only imports so it can be
/// shared with client components without pulling Prisma into the browser
/// bundle. Note: file paths are intentionally omitted — the browser only ever
/// references media through the /api/media/<type>/<shortcode> routes.
export interface ReelView {
  id: string;
  shortcode: string;
  reelUrl: string;
  caption: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  likedAt: string | Date | null;
  isFavorite: boolean;
  creator: { username: string } | null;
}

export function videoSrc(shortcode: string): string {
  return `/api/media/video/${shortcode}`;
}

export function thumbSrc(shortcode: string): string {
  return `/api/media/thumb/${shortcode}`;
}
