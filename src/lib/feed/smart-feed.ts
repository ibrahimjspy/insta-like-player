/**
 * Public API for the For you feed query (`order=random`).
 */

import { Prisma } from "@prisma/client";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import { buildSmartFeedIdsSql } from "@/lib/feed/sql";

/** Deduplicates and caps session exclude ids (see `FEED_TASTE_CONFIG.exclude`). */
export function normalizeExcludeIds(ids: string[] | undefined): string[] {
  const max = FEED_TASTE_CONFIG.exclude.maxSessionIds;
  if (!ids?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id) || out.length >= max) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function buildExcludeClause(excludeIds: string[]): Prisma.Sql {
  const exclude = normalizeExcludeIds(excludeIds);
  if (exclude.length === 0) return Prisma.empty;
  return Prisma.sql`AND r.id NOT IN (${Prisma.join(exclude.map((id) => Prisma.sql`${id}`))})`;
}

/**
 * Returns reel ids for one For you page, ranked by personalized score
 * then Gumbel-weighted sampling for variety.
 */
export function smartFeedIdsQuery(take: number, excludeIds: string[] = []): Prisma.Sql {
  return buildSmartFeedIdsSql(take, buildExcludeClause(excludeIds));
}
