/**
 * Builds the For you feed SQL from {@link FEED_TASTE_CONFIG}.
 * Single round-trip: engagement → taste aggregates → scored candidates → Gumbel sample.
 */

import { Prisma } from "@prisma/client";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";

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
        r."isFavorite",
        LEAST(
          e."totalWatchSec"::float / GREATEST(COALESCE(r."durationSec", ${cfg.duration.defaultSec}), 1),
          ${t.watchDepthCap}
        ) AS watch_depth,
        LEAST(
          e."maxPositionSec"::float / GREATEST(COALESCE(r."durationSec", ${cfg.duration.defaultSec}), 1),
          1
        ) AS peak_completion,
        (
          e."totalWatchSec"
          + e."watchCount" * ${r.perWatchCount}
          + e."deepWatchCount" * ${r.perDeepWatch}
          + e."loopCount" * ${r.perLoop}
          + e."quickSkipCount" * ${r.perQuickSkip}
        )::float
        * EXP(
          -EXTRACT(
            EPOCH FROM (
              NOW() - COALESCE(e."lastWatchedAt", NOW() - INTERVAL '400 days')
            )
          ) / 86400 / ${cfg.decayHalfLifeDays} * LN(2)
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
    tag_scores AS (
      SELECT rh."B" AS "hashtagId", SUM(eq.decayed_eng)::float AS s
      FROM eng eq
      INNER JOIN "_ReelHashtags" rh ON rh."A" = eq."reelId"
      GROUP BY rh."B"
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
        (SELECT COALESCE(MAX(s), 1) FROM creator_scores) AS max_creator,
        (SELECT COALESCE(MAX(s), 1) FROM tag_scores) AS max_tag,
        (SELECT COALESCE(MAX(s), 1) FROM collection_scores) AS max_collection,
        (SELECT COALESCE(MAX(s), 1) FROM duration_taste) AS max_duration
    ),
    loved_creators AS (
      SELECT cs.cid
      FROM creator_scores cs
      CROSS JOIN norms n
      WHERE cs.s / n.max_creator >= ${t.lovedCreatorMinRatio}
    ),
    strong_tags AS (
      SELECT ts."hashtagId"
      FROM tag_scores ts
      CROSS JOIN norms n
      WHERE ts.s / n.max_tag >= ${t.strongTagMinRatio}
    ),
    reel_tag_affinity AS (
      SELECT
        rh."A" AS "reelId",
        SUM(ts.s / n.max_tag)::float AS tag_sum,
        COUNT(*) FILTER (WHERE st."hashtagId" IS NOT NULL)::int AS strong_tag_hits
      FROM "_ReelHashtags" rh
      INNER JOIN tag_scores ts ON ts."hashtagId" = rh."B"
      CROSS JOIN norms n
      LEFT JOIN strong_tags st ON st."hashtagId" = rh."B"
      GROUP BY rh."A", n.max_tag
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
          CASE WHEN eq."reelId" IS NULL THEN ${w.unseenBoost} ELSE 0 END
          + COALESCE(eq.watch_depth, 0) * ${w.watchDepth}
          + COALESCE(eq.peak_completion, 0) * ${w.peakCompletion}
          + LEAST(COALESCE(eq."deepWatchCount", 0) * ${w.deepWatchCount}, ${w.deepWatchCountCap})
          + LEAST(COALESCE(eq."loopCount", 0) * ${w.loopCount}, ${w.loopCountCap})
          + COALESCE(cs.s / n.max_creator, 0) * ${w.creatorAffinity}
          + COALESCE(rta.tag_sum, 0) * ${w.tagSum}
          + LEAST(COALESCE(rta.strong_tag_hits, 0) * ${w.strongTagHit}, ${w.strongTagHitCap})
          + COALESCE(rca.col_aff, 0) * ${w.collectionAffinity}
          + COALESCE(dt.s / NULLIF(n.max_duration, 0), 0)
          * CASE
              WHEN COALESCE(r."durationSec", ${cfg.duration.defaultSec}) < ${cfg.duration.shortMaxSec} THEN ${w.durationTaste}
              WHEN COALESCE(r."durationSec", ${cfg.duration.defaultSec}) < ${cfg.duration.mediumMaxSec} THEN ${w.durationTasteMedium}
              ELSE ${w.durationTasteLong}
            END
          + CASE WHEN r."isFavorite" THEN ${w.favorite} ELSE 0 END
          + CASE
              WHEN lc.cid IS NOT NULL AND eq."reelId" IS NULL THEN ${w.lovedCreatorUnseen}
              ELSE 0
            END
          + CASE
              WHEN eq."reelId" IS NULL
                AND COALESCE(rta.strong_tag_hits, 0) >= ${t.strongTagHitsForDiscovery} THEN ${w.tagDiscoveryUnseen}
              ELSE 0
            END
          + CASE
              WHEN eq."reelId" IS NULL
                AND r."likedAt" > NOW() - (${t.likedAtRecencyDays} * INTERVAL '1 day') THEN ${w.likedAtRecencyUnseen}
              ELSE 0
            END
          - CASE
              WHEN COALESCE(eq."quickSkipCount", 0) >= ${t.quickSkipCountMin}
                OR (
                  COALESCE(eq.peak_completion, 0) < ${t.peakCompletionSkipMax}
                  AND COALESCE(eq."watchCount", 0) >= ${t.watchCountSkipMin}
                ) THEN ${w.quickSkipPenalty}
              ELSE 0
            END
          - CASE
              WHEN COALESCE(eq."watchCount", 0) >= ${t.overexposedWatchCount}
                AND COALESCE(eq."totalWatchSec", 0) > ${t.overexposedTotalSec} THEN ${w.overexposedPenalty}
              ELSE 0
            END
          - CASE
              WHEN eq."lastWatchedAt" > NOW() - (${t.recent3hHours} * INTERVAL '1 hour') THEN ${w.recent3hPenalty}
              ELSE 0
            END
          - CASE
              WHEN eq."lastWatchedAt" > NOW() - (${t.recent24hHours} * INTERVAL '1 hour')
                AND COALESCE(eq."watchCount", 0) >= ${t.recent24hWatchCount} THEN ${w.recent24hRepeatPenalty}
              ELSE 0
            END
        )::float AS score
      FROM "Reel" r
      CROSS JOIN norms n
      LEFT JOIN eng eq ON eq."reelId" = r.id
      LEFT JOIN creator_scores cs ON cs.cid = r."creatorId"
      LEFT JOIN reel_tag_affinity rta ON rta."reelId" = r.id
      LEFT JOIN reel_collection_aff rca ON rca."reelId" = r.id
      LEFT JOIN loved_creators lc ON lc.cid = r."creatorId"
      LEFT JOIN duration_taste dt ON dt.bucket = ${Prisma.raw(durCaseR)}
      WHERE r.status = 'DOWNLOADED'
      ${excludeClause}
    )
    SELECT id
    FROM candidates
    WHERE score > ${t.minCandidateScore}
    ORDER BY (-LN(GREATEST(random(), 1e-12)) / score) ASC
    LIMIT ${take}
  `;
}
