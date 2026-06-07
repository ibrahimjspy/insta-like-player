/**
 * Builds the For you feed SQL from {@link FEED_TASTE_CONFIG}.
 * Single round-trip: engagement → taste aggregates → scored candidates → Gumbel sample.
 */

import { Prisma } from "@prisma/client";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

/**
 * Inline numeric literal for raw SQL.
 * Prisma's pg adapter can bind `${number}` as text, which breaks `float * $param` in Postgres.
 */
export function sqlFloat(n: number): Prisma.Sql {
  if (!Number.isFinite(n)) throw new Error(`Invalid SQL float: ${n}`);
  return Prisma.raw(String(n));
}

/** Flattens a Prisma.sql fragment for assertions in tests (strings + bound values). */
export function sqlQueryText(fragment: Prisma.Sql): string {
  let out = "";
  for (let i = 0; i < fragment.strings.length; i++) {
    out += fragment.strings[i];
    if (i < fragment.values.length) out += String(fragment.values[i]);
  }
  return out;
}

/** SQL `CASE` for duration bucket; `column` is a quoted column ref e.g. `r."durationSec"`. */
export function sqlDurationBucketCase(column: string): string {
  const { defaultSec, shortMaxSec, mediumMaxSec } = FEED_TASTE_CONFIG.duration;
  return `CASE
    WHEN COALESCE(${column}, ${defaultSec}) < ${shortMaxSec} THEN 'short'
    WHEN COALESCE(${column}, ${defaultSec}) < ${mediumMaxSec} THEN 'medium'
    ELSE 'long'
  END`;
}

/**
 * @param take - page size
 * @param excludeClause - `Prisma.empty` or `AND r.id NOT IN (...)`
 */
export function buildSmartFeedIdsSql(
  take: number,
  excludeClause: Prisma.Sql,
): Prisma.Sql {
  const cfg = FEED_TASTE_CONFIG;
  const w = cfg.scoreWeights;
  const t = cfg.thresholds;
  const r = cfg.engagementRaw;
  const tag = cfg.tagAffinity;
  const durCaseR = sqlDurationBucketCase('r."durationSec"');
  const durCaseEq = sqlDurationBucketCase('eq."durationSec"');

  return Prisma.sql`
    WITH eng AS (
      SELECT
        e."reelId",
        e."watchCount",
        e."totalWatchSec",
        e."maxPositionSec",
        e."lastWatchedAt",
        e."loopCount",
        e."deepWatchCount",
        e."quickSkipCount",
        r."durationSec",
        r."creatorId",
        r.platform,
        r."isFavorite",
        LEAST(
          e."totalWatchSec"::float / GREATEST(COALESCE(r."durationSec", ${sqlFloat(cfg.duration.defaultSec)}), 1),
          ${sqlFloat(t.watchDepthCap)}
        ) AS watch_depth,
        LEAST(
          e."maxPositionSec"::float / GREATEST(COALESCE(r."durationSec", ${sqlFloat(cfg.duration.defaultSec)}), 1),
          1
        ) AS peak_completion,
        GREATEST(
          (
            e."totalWatchSec"
            + e."watchCount" * ${sqlFloat(r.perWatchCount)}
            + e."deepWatchCount" * ${sqlFloat(r.perDeepWatch)}
            + e."loopCount" * ${sqlFloat(r.perLoop)}
            + e."quickSkipCount" * ${sqlFloat(r.perQuickSkip)}
          )::float,
          0
        )
        * EXP(
          -EXTRACT(
            EPOCH FROM (
              NOW() - COALESCE(e."lastWatchedAt", NOW() - INTERVAL '400 days')
            )
          ) / 86400 / ${sqlFloat(cfg.decayHalfLifeDays)} * LN(2)
        ) AS decayed_eng
      FROM "ReelEngagement" e
      INNER JOIN "Reel" r ON r.id = e."reelId"
      WHERE r.status = 'DOWNLOADED'
    ),
    creator_scores AS (
      SELECT eq."creatorId" AS cid, SUM(eq.decayed_eng)::float AS s
      FROM eng eq
      WHERE eq."creatorId" IS NOT NULL
      GROUP BY eq."creatorId"
    ),
    platform_scores AS (
      SELECT eq.platform, SUM(eq.decayed_eng)::float AS s
      FROM eng eq
      GROUP BY eq.platform
    ),
    tag_document_counts AS (
      SELECT rh."A" AS "hashtagId", COUNT(DISTINCT rh."B")::int AS reel_count
      FROM "_ReelHashtags" rh
      INNER JOIN "Reel" tr ON tr.id = rh."B"
      WHERE tr.status = 'DOWNLOADED'
      GROUP BY rh."A"
    ),
    library_size AS (
      SELECT GREATEST(COUNT(*)::float, 1) AS downloaded_count
      FROM "Reel"
      WHERE status = 'DOWNLOADED'
    ),
    tag_scores AS (
      SELECT
        rh."A" AS "hashtagId",
        SUM(
          eq.decayed_eng
          * GREATEST(
              LN(${sqlFloat(tag.idfSmoothing)} + ls.downloaded_count / GREATEST(tdc.reel_count, 1)),
              ${sqlFloat(tag.minIdf)}
            )
        )::float AS s
      FROM eng eq
      INNER JOIN "_ReelHashtags" rh ON rh."B" = eq."reelId"
      INNER JOIN tag_document_counts tdc ON tdc."hashtagId" = rh."A"
      CROSS JOIN library_size ls
      GROUP BY rh."A"
    ),
    collection_scores AS (
      SELECT cr."collectionId", SUM(eq.decayed_eng)::float AS s
      FROM "CollectionReel" cr
      INNER JOIN eng eq ON eq."reelId" = cr."reelId"
      GROUP BY cr."collectionId"
    ),
    duration_taste AS (
      SELECT
        ${Prisma.raw(durCaseEq)} AS bucket,
        SUM(eq.decayed_eng)::float AS s
      FROM eng eq
      GROUP BY 1
    ),
    norms AS (
      SELECT
        (SELECT GREATEST(COALESCE(MAX(s), 0), 1) FROM creator_scores) AS max_creator,
        (SELECT GREATEST(COALESCE(MAX(s), 0), 1) FROM platform_scores) AS max_platform,
        (SELECT GREATEST(COALESCE(MAX(s), 0), 1) FROM tag_scores) AS max_tag,
        (SELECT GREATEST(COALESCE(MAX(s), 0), 1) FROM collection_scores) AS max_collection,
        (SELECT GREATEST(COALESCE(MAX(s), 0), 1) FROM duration_taste) AS max_duration
    ),
    loved_creators AS (
      SELECT cs.cid
      FROM creator_scores cs
      CROSS JOIN norms n
      WHERE cs.s / n.max_creator >= ${sqlFloat(t.lovedCreatorMinRatio)}
    ),
    strong_tags AS (
      SELECT ts."hashtagId"
      FROM tag_scores ts
      CROSS JOIN norms n
      WHERE ts.s / n.max_tag >= ${sqlFloat(t.strongTagMinRatio)}
    ),
    reel_tag_affinity AS (
      SELECT
        rh."B" AS "reelId",
        SUM(ts.s / n.max_tag)::float AS tag_sum,
        COUNT(*) FILTER (WHERE st."hashtagId" IS NOT NULL)::int AS strong_tag_hits
      FROM "_ReelHashtags" rh
      INNER JOIN tag_scores ts ON ts."hashtagId" = rh."A"
      CROSS JOIN norms n
      LEFT JOIN strong_tags st ON st."hashtagId" = rh."A"
      GROUP BY rh."B", n.max_tag
    ),
    reel_collection_aff AS (
      SELECT cr."reelId", MAX(cs.s / n.max_collection)::float AS col_aff
      FROM "CollectionReel" cr
      INNER JOIN collection_scores cs ON cs."collectionId" = cr."collectionId"
      CROSS JOIN norms n
      GROUP BY cr."reelId", n.max_collection
    ),
    candidates AS (
      SELECT
        r.id,
        (
          CASE WHEN eq."reelId" IS NULL THEN ${sqlFloat(w.unseenBoost)} ELSE 0 END
          + COALESCE(eq.watch_depth, 0) * ${sqlFloat(w.watchDepth)}
          + COALESCE(eq.peak_completion, 0) * ${sqlFloat(w.peakCompletion)}
          + LEAST(COALESCE(eq."deepWatchCount", 0) * ${sqlFloat(w.deepWatchCount)}, ${sqlFloat(w.deepWatchCountCap)})
          + LEAST(COALESCE(eq."loopCount", 0) * ${sqlFloat(w.loopCount)}, ${sqlFloat(w.loopCountCap)})
          + COALESCE(cs.s / n.max_creator, 0) * ${sqlFloat(w.creatorAffinity)}
          + COALESCE(ps.s / n.max_platform, 0) * ${sqlFloat(w.platformAffinity)}
          + COALESCE(rta.tag_sum, 0) * ${sqlFloat(w.tagSum)}
          + LEAST(COALESCE(rta.strong_tag_hits, 0) * ${sqlFloat(w.strongTagHit)}, ${sqlFloat(w.strongTagHitCap)})
          + COALESCE(rca.col_aff, 0) * ${sqlFloat(w.collectionAffinity)}
          + COALESCE(dt.s / NULLIF(n.max_duration, 0), 0)
          * CASE
              WHEN COALESCE(r."durationSec", ${sqlFloat(cfg.duration.defaultSec)}) < ${sqlFloat(cfg.duration.shortMaxSec)} THEN ${sqlFloat(w.durationTaste)}
              WHEN COALESCE(r."durationSec", ${sqlFloat(cfg.duration.defaultSec)}) < ${sqlFloat(cfg.duration.mediumMaxSec)} THEN ${sqlFloat(w.durationTasteMedium)}
              ELSE ${sqlFloat(w.durationTasteLong)}
            END
          + CASE WHEN r."isFavorite" THEN ${sqlFloat(w.favorite)} ELSE 0 END
          + CASE
              WHEN lc.cid IS NOT NULL AND eq."reelId" IS NULL THEN ${sqlFloat(w.lovedCreatorUnseen)}
              ELSE 0
            END
          + CASE
              WHEN eq."reelId" IS NULL
                AND COALESCE(rta.strong_tag_hits, 0) >= ${sqlFloat(t.strongTagHitsForDiscovery)} THEN ${sqlFloat(w.tagDiscoveryUnseen)}
              ELSE 0
            END
          + CASE
              WHEN eq."reelId" IS NULL
                AND r."likedAt" > NOW() - (${sqlFloat(t.likedAtRecencyDays)} * INTERVAL '1 day') THEN ${sqlFloat(w.likedAtRecencyUnseen)}
              ELSE 0
            END
          - CASE
              WHEN COALESCE(eq."quickSkipCount", 0) >= ${sqlFloat(t.quickSkipCountMin)}
                OR (
                  COALESCE(eq.peak_completion, 0) < ${sqlFloat(t.peakCompletionSkipMax)}
                  AND COALESCE(eq."watchCount", 0) >= ${sqlFloat(t.watchCountSkipMin)}
                ) THEN ${sqlFloat(w.quickSkipPenalty)}
              ELSE 0
            END
          - CASE
              WHEN COALESCE(eq."watchCount", 0) >= ${sqlFloat(t.overexposedWatchCount)}
                AND COALESCE(eq."totalWatchSec", 0) > ${sqlFloat(t.overexposedTotalSec)} THEN ${sqlFloat(w.overexposedPenalty)}
              ELSE 0
            END
          - CASE
              WHEN eq."lastWatchedAt" > NOW() - (${sqlFloat(t.recent3hHours)} * INTERVAL '1 hour') THEN ${sqlFloat(w.recent3hPenalty)}
              ELSE 0
            END
          - CASE
              WHEN eq."lastWatchedAt" > NOW() - (${sqlFloat(t.recent24hHours)} * INTERVAL '1 hour')
                AND COALESCE(eq."watchCount", 0) >= ${sqlFloat(t.recent24hWatchCount)} THEN ${sqlFloat(w.recent24hRepeatPenalty)}
              ELSE 0
            END
        )::float AS score
      FROM "Reel" r
      CROSS JOIN norms n
      LEFT JOIN eng eq ON eq."reelId" = r.id
      LEFT JOIN creator_scores cs ON cs.cid = r."creatorId"
      LEFT JOIN platform_scores ps ON ps.platform = r.platform
      LEFT JOIN reel_tag_affinity rta ON rta."reelId" = r.id
      LEFT JOIN reel_collection_aff rca ON rca."reelId" = r.id
      LEFT JOIN loved_creators lc ON lc.cid = r."creatorId"
      LEFT JOIN duration_taste dt ON dt.bucket = ${Prisma.raw(durCaseR)}
      WHERE r.status = 'DOWNLOADED'
      ${excludeClause}
    )
    SELECT id
    FROM candidates
    WHERE score > ${sqlFloat(t.minCandidateScore)}
    ORDER BY (-LN(GREATEST(random(), 1e-12)) / score) ASC
    LIMIT ${sqlFloat(take)}
  `;
}
