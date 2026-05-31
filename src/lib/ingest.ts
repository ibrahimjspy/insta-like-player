import { prisma } from "@/lib/db";
import { canonicalReelUrl, extractShortcode } from "@/lib/instagram";

/// A single normalised like extracted from an Instagram export.
export interface ParsedLike {
  shortcode: string;
  reelUrl: string;
  creatorUsername: string | null;
  likedAt: Date | null;
}

export interface ImportResult {
  parsed: number;
  imported: number;
  skippedDuplicates: number;
  skippedUnparseable: number;
}

/// Parses the `liked_posts.json` produced by Instagram's "Download Your
/// Information" export. The export shape is:
///   { "likes_media_likes": [ { "title": "<username>",
///       "string_list_data": [ { "href": "<url>", "timestamp": <unix> } ] } ] }
/// We're defensive about the shape since Instagram tweaks it over time.
export function parseLikedPosts(raw: unknown): ParsedLike[] {
  const root = raw as Record<string, unknown>;
  const entries =
    (root?.likes_media_likes as unknown[]) ??
    (root?.likes as unknown[]) ??
    (Array.isArray(raw) ? (raw as unknown[]) : []);

  const likes: ParsedLike[] = [];

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title : null;
    const list = (e.string_list_data as Record<string, unknown>[]) ?? [];

    for (const item of list) {
      const href = typeof item.href === "string" ? item.href : null;
      if (!href) continue;

      const shortcode = extractShortcode(href);
      if (!shortcode) continue;

      const ts = typeof item.timestamp === "number" ? item.timestamp : null;

      likes.push({
        shortcode,
        reelUrl: canonicalReelUrl(shortcode),
        creatorUsername: title,
        likedAt: ts ? new Date(ts * 1000) : null,
      });
    }
  }

  return likes;
}

/// Upserts parsed likes into the database. Existing reels (matched by
/// shortcode) are left untouched so re-importing an export is idempotent and
/// never clobbers download status.
export async function importLikes(likes: ParsedLike[]): Promise<ImportResult> {
  const result: ImportResult = {
    parsed: likes.length,
    imported: 0,
    skippedDuplicates: 0,
    skippedUnparseable: 0,
  };

  for (const like of likes) {
    if (!like.shortcode) {
      result.skippedUnparseable += 1;
      continue;
    }

    const existing = await prisma.reel.findUnique({
      where: { shortcode: like.shortcode },
      select: { id: true },
    });

    if (existing) {
      result.skippedDuplicates += 1;
      continue;
    }

    const creator = like.creatorUsername
      ? await prisma.creator.upsert({
          where: { username: like.creatorUsername },
          create: { username: like.creatorUsername },
          update: {},
        })
      : null;

    await prisma.reel.create({
      data: {
        shortcode: like.shortcode,
        reelUrl: like.reelUrl,
        likedAt: like.likedAt,
        creatorId: creator?.id,
        status: "PENDING",
      },
    });

    result.imported += 1;
  }

  return result;
}
