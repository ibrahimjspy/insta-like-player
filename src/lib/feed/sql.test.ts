import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import {
  buildSmartFeedIdsSql,
  sqlDurationBucketCase,
  sqlFloat,
  sqlQueryText,
} from "@/lib/feed/sql";

describe("sqlDurationBucketCase", () => {
  it("embeds configured duration boundaries", () => {
    const { shortMaxSec, mediumMaxSec, defaultSec } = FEED_TASTE_CONFIG.duration;
    const sql = sqlDurationBucketCase('r."durationSec"');
    expect(sql).toContain(String(shortMaxSec));
    expect(sql).toContain(String(mediumMaxSec));
    expect(sql).toContain(String(defaultSec));
    expect(sql).toContain("'short'");
    expect(sql).toContain("'long'");
  });
});

describe("sqlFloat", () => {
  it("inlines numbers so Postgres never sees text operands", () => {
    const f = sqlFloat(2.35);
    expect(f.strings.join("")).toBe("2.35");
    expect(f.values).toHaveLength(0);
  });
});

describe("buildSmartFeedIdsSql", () => {
  const text = (take: number, exclude: string[] = []) =>
    sqlQueryText(
      buildSmartFeedIdsSql(
        take,
        exclude.length
          ? Prisma.sql`AND r.id NOT IN (${Prisma.join(exclude.map((id) => Prisma.sql`${id}`))})`
          : Prisma.empty,
      ),
    );

  it("includes all major CTEs", () => {
    const sql = text(10);
    for (const cte of [
      "eng AS",
      "creator_scores",
      "platform_scores",
      "tag_document_counts",
      "tag_scores",
      "collection_scores",
      "duration_taste",
      "loved_creators",
      "strong_tags",
      "reel_tag_affinity",
      "candidates",
    ]) {
      expect(sql).toContain(cte);
    }
  });

  it("injects config weights into the score expression", () => {
    const w = FEED_TASTE_CONFIG.scoreWeights;
    const sql = text(5);
    expect(sql).toContain(String(w.unseenBoost));
    expect(sql).toContain(String(w.creatorAffinity));
    expect(sql).toContain(String(w.platformAffinity));
    expect(sql).toContain(String(w.recent3hPenalty));
    expect(sql).toContain(String(FEED_TASTE_CONFIG.engagementRaw.perDeepWatch));
  });

  it("clamps raw decayed engagement to non-negative taste", () => {
    const sql = text(5);
    expect(sql).toContain("GREATEST(");
    expect(sql).toContain(`+ e."quickSkipCount" * ${FEED_TASTE_CONFIG.engagementRaw.perQuickSkip}`);
    expect(sql).toContain(") AS decayed_eng");
  });

  it("uses Prisma implicit hashtag join direction correctly", () => {
    const sql = text(5);
    expect(sql).toContain('SELECT rh."A" AS "hashtagId"');
    expect(sql).toContain('INNER JOIN "_ReelHashtags" rh ON rh."B" = eq."reelId"');
    expect(sql).toContain('rh."B" AS "reelId"');
    expect(sql).toContain('INNER JOIN tag_scores ts ON ts."hashtagId" = rh."A"');
  });

  it("downweights broad tags with document-frequency weighting", () => {
    const sql = text(5);
    expect(sql).toContain("downloaded_count / GREATEST(tdc.reel_count, 1)");
    expect(sql).toContain(String(FEED_TASTE_CONFIG.tagAffinity.idfSmoothing));
    expect(sql).toContain(String(FEED_TASTE_CONFIG.tagAffinity.minIdf));
  });

  it("floors normalization denominators to avoid divide-by-zero scores", () => {
    expect(text(5)).toContain("GREATEST(COALESCE(MAX(s), 0), 1)");
  });

  it("uses Gumbel sampling for variety", () => {
    expect(text(3)).toContain("LN(");
  });

  it("respects exclude clause", () => {
    expect(text(3, ["a", "b"])).toContain("NOT IN");
  });

  it("embeds minimum candidate score from config", () => {
    expect(text(1)).toContain(
      `score > ${FEED_TASTE_CONFIG.thresholds.minCandidateScore}`,
    );
  });
});
