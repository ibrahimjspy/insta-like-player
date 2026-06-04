import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { FEED_TASTE_CONFIG } from "@/lib/feed/config";
import { buildSmartFeedIdsSql, sqlDurationBucketCase, sqlQueryText } from "@/lib/feed/sql";

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
    expect(sql).toContain(String(w.recent3hPenalty));
    expect(sql).toContain(String(FEED_TASTE_CONFIG.engagementRaw.perDeepWatch));
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
