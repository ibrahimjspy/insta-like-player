/**
 * Ingest a platform data export into the database.
 *
 * Usage:
 *   npm run ingest -- path/to/liked_posts.json
 *   npm run ingest -- --platform tiktok path/to/user_data_tiktok.json
 *   npm run ingest -- --platform facebook path/to/posts_and_comments.json
 */
import type { Platform } from "@prisma/client";
import { promises as fs } from "node:fs";

import { prisma } from "@/lib/db";
import { importLikes } from "@/lib/ingest";
import { exportHint, parseExport, platformFromSlug } from "@/lib/platforms";

function parseArgs(argv: string[]): { platform: Platform; file: string | undefined } {
  let platform: Platform = "INSTAGRAM";
  let file: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--platform" || argv[i] === "-p") {
      const slug = argv[++i];
      const parsed = slug ? platformFromSlug(slug) : null;
      if (!parsed) {
        console.error(`Unknown platform: ${slug}. Use instagram, tiktok, or facebook.`);
        process.exit(1);
      }
      platform = parsed;
    } else if (!file) {
      file = argv[i];
    }
  }

  return { platform, file };
}

async function main() {
  const { platform, file } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("Usage: npm run ingest -- [--platform instagram|tiktok|facebook] <export.json>");
    process.exit(1);
  }

  const raw = await fs.readFile(file, "utf8").catch(() => {
    console.error(`Could not read file: ${file}`);
    process.exit(1);
  });

  const likes = parseExport(platform, JSON.parse(raw));
  console.log(`Parsed ${likes.length} liked videos from ${exportHint(platform)}.`);

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
