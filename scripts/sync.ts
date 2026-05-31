/**
 * Download pending reels via yt-dlp.
 *
 * Usage:
 *   npm run sync                      # download PENDING reels (/reel/, /tv/ only)
 *   npm run sync -- --limit 50        # only the next 50
 *   npm run sync -- --retry           # also re-attempt FAILED reels
 *   npm run sync -- --include-posts   # also try generic /p/ likes (photos may fail)
 */
import { prisma } from "@/lib/db";
import { syncPending } from "@/lib/sync";

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let includeFailed = false;
  let includePosts = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Number(argv[++i]);
    else if (argv[i] === "--retry" || argv[i] === "--include-failed") includeFailed = true;
    else if (argv[i] === "--include-posts") includePosts = true;
  }
  return { limit, includeFailed, reelsOnly: !includePosts };
}

async function main() {
  const { limit, includeFailed, reelsOnly } = parseArgs(process.argv.slice(2));

  const summary = await syncPending({
    limit,
    includeFailed,
    reelsOnly,
    onProgress: (e) => {
      const tag = e.status === "DOWNLOADED" ? "ok " : e.status === "UNAVAILABLE" ? "gone" : "FAIL";
      const extra = e.message ? ` — ${e.message.split("\n")[0]}` : "";
      console.log(`[${e.index}/${e.total}] ${tag} ${e.shortcode}${extra}`);
    },
  });

  console.log("\nSync complete:");
  console.log(`  downloaded:    ${summary.downloaded}`);
  console.log(`  failed:        ${summary.failed}`);
  console.log(`  unavailable:   ${summary.unavailable}`);
  if (summary.skippedPosts > 0) {
    console.log(`  skipped /p/:   ${summary.skippedPosts} (reels-only; use --include-posts to try them)`);
  }
  if (summary.total === 0) {
    console.log("Nothing to do — no pending reels. Import an export first with `npm run ingest`.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
