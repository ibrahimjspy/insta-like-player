import { prisma } from "@/lib/db";
import { parseHashtags } from "@/lib/platforms";
import type { ParsedLike } from "@/lib/platforms/types";

export type { ParsedLike };

export interface ImportResult {
  parsed: number;
  imported: number;
  updated: number;
  skippedUnparseable: number;
}

// Re-export Instagram parser for backward compatibility in tests.
export { parseInstagramLikes as parseLikedPosts } from "@/lib/platforms";

/// Upserts parsed likes into the database. Existing reels (matched by
/// platform + shortcode) keep their download status/media, but have their
/// canonical URL and caption refreshed — so re-importing is idempotent.
export async function importLikes(likes: ParsedLike[]): Promise<ImportResult> {
  const result: ImportResult = {
    parsed: likes.length,
    imported: 0,
    updated: 0,
    skippedUnparseable: 0,
  };

  for (const like of likes) {
    if (!like.shortcode) {
      result.skippedUnparseable += 1;
      continue;
    }

    const existing = await prisma.reel.findUnique({
      where: {
        platform_shortcode: { platform: like.platform, shortcode: like.shortcode },
      },
      select: { id: true, caption: true },
    });

    if (existing) {
      await prisma.reel.update({
        where: { id: existing.id },
        data: {
          reelUrl: like.reelUrl,
          ...(existing.caption ? {} : { caption: like.caption }),
        },
      });
      result.updated += 1;
      continue;
    }

    const creator = like.creatorUsername
      ? await prisma.creator.upsert({
          where: {
            platform_username: {
              platform: like.platform,
              username: like.creatorUsername,
            },
          },
          create: { platform: like.platform, username: like.creatorUsername },
          update: {},
        })
      : null;

    const tags = parseHashtags(like.caption);

    await prisma.reel.create({
      data: {
        platform: like.platform,
        shortcode: like.shortcode,
        reelUrl: like.reelUrl,
        caption: like.caption,
        likedAt: like.likedAt,
        creatorId: creator?.id,
        status: "PENDING",
        hashtags: {
          connectOrCreate: tags.map((tag) => ({
            where: { tag },
            create: { tag },
          })),
        },
      },
    });

    result.imported += 1;
  }

  return result;
}
