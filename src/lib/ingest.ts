import { prisma } from "@/lib/db";
import { extractShortcode, normalizeInstagramUrl, parseHashtags } from "@/lib/instagram";

/// A single normalised like extracted from an Instagram export.
export interface ParsedLike {
  shortcode: string;
  reelUrl: string;
  creatorUsername: string | null;
  likedAt: Date | null;
  caption: string | null;
}

export interface ImportResult {
  parsed: number;
  imported: number;
  /// Existing reels whose URL/metadata were refreshed (download status kept).
  updated: number;
  skippedUnparseable: number;
}

/// Parses the `liked_posts.json` produced by Instagram's "Download Your
/// Information" export. Instagram has shipped (at least) two shapes:
///
///   Legacy:  { "likes_media_likes": [ { "title": "<username>",
///                "string_list_data": [ { "href": "<url>", "timestamp": <unix> } ] } ] }
///
///   Current: [ { "timestamp": <unix>, "label_values": [
///                { "label": "URL", "value"/"href": "<url>" },
///                { "label": "Caption", "value": "<caption>" },
///                { "title": "Owner", "dict": [ { "dict": [ { "label": "Username",
///                  "value": "<username>" } ] } ] } ] } ]
///
/// We dispatch per-entry so both shapes work, and stay defensive since
/// Instagram tweaks this over time.
export function parseLikedPosts(raw: unknown): ParsedLike[] {
  const root = raw as Record<string, unknown>;
  const entries =
    (root?.likes_media_likes as unknown[]) ??
    (root?.likes as unknown[]) ??
    (Array.isArray(raw) ? (raw as unknown[]) : []);

  const likes: ParsedLike[] = [];

  for (const entry of entries) {
    const e = entry as Record<string, unknown>;

    if (Array.isArray(e?.label_values)) {
      const like = parseLabelValueEntry(e);
      if (like) likes.push(like);
      continue;
    }

    // Legacy string_list_data shape (one entry may hold multiple links).
    const title = typeof e.title === "string" ? e.title : null;
    const list = (e.string_list_data as Record<string, unknown>[]) ?? [];
    for (const item of list) {
      const href = typeof item.href === "string" ? item.href : null;
      const shortcode = href ? extractShortcode(href) : null;
      if (!shortcode) continue;
      const ts = typeof item.timestamp === "number" ? item.timestamp : null;
      likes.push({
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
  dict?: LabelValue[];
}

/// Parses a single entry from the current `label_values` export shape.
function parseLabelValueEntry(entry: Record<string, unknown>): ParsedLike | null {
  const values = (entry.label_values as LabelValue[]) ?? [];

  const urlItem = values.find((v) => v.label === "URL" && (v.href || v.value));
  const href = urlItem?.href || urlItem?.value;
  if (!href) return null;
  const shortcode = extractShortcode(href);
  if (!shortcode) return null;

  const caption = values.find((v) => v.label === "Caption")?.value ?? null;

  // Owner is a nested group: { title: "Owner", dict: [ { dict: [ {Username} ] } ] }
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
    shortcode,
    reelUrl: normalizeInstagramUrl(href),
    creatorUsername,
    likedAt: ts ? new Date(ts * 1000) : null,
    caption: caption || null,
  };
}

/// Upserts parsed likes into the database. Existing reels (matched by
/// shortcode) keep their download status/media, but have their canonical URL
/// and caption refreshed — so re-importing is idempotent and also corrects the
/// stored URL type (/reel/ vs /p/ vs /tv/) for rows imported by older versions.
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
      where: { shortcode: like.shortcode },
      select: { id: true, caption: true },
    });

    if (existing) {
      await prisma.reel.update({
        where: { id: existing.id },
        data: {
          reelUrl: like.reelUrl,
          // Only fill caption if we didn't already have one.
          ...(existing.caption ? {} : { caption: like.caption }),
        },
      });
      result.updated += 1;
      continue;
    }

    const creator = like.creatorUsername
      ? await prisma.creator.upsert({
          where: { username: like.creatorUsername },
          create: { username: like.creatorUsername },
          update: {},
        })
      : null;

    // The current export already includes caption + hashtags, so store them
    // now. They're refreshed/confirmed later by the yt-dlp sync step.
    const tags = parseHashtags(like.caption);

    await prisma.reel.create({
      data: {
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
