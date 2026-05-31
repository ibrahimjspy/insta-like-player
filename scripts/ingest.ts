/**
 * Ingest an Instagram "Download Your Information" export into the database.
 *
 * Usage:
 *   npm run ingest -- path/to/liked_posts.json
 */
import { promises as fs } from "node:fs";

import { prisma } from "@/lib/db";
import { importLikes, parseLikedPosts } from "@/lib/ingest";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run ingest -- <path-to-liked_posts.json>");
    process.exit(1);
  }

  const raw = await fs.readFile(file, "utf8").catch(() => {
    console.error(`Could not read file: ${file}`);
    process.exit(1);
  });

  const likes = parseLikedPosts(JSON.parse(raw));
  console.log(`Parsed ${likes.length} liked reels from export.`);

  const result = await importLikes(likes);
  console.log("Import complete:");
  console.log(`  imported new:        ${result.imported}`);
  console.log(`  updated existing:    ${result.updated}`);
  console.log(`  skipped unparseable: ${result.skippedUnparseable}`);
  console.log("\nNext step: run `npm run sync` to download the media.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
