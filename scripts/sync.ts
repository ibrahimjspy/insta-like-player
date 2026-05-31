/**
 * Download pending reels via yt-dlp.
 *
 * Usage:
 *   npm run sync                 # download all PENDING reels
 *   npm run sync -- --limit 50   # only the next 50
 *   npm run sync -- --retry      # also re-attempt FAILED reels
 */
import { prisma } from "@/lib/db";
import { syncPending } from "@/lib/sync";

function parseArgs(argv: string[]) {
  let limit: number | undefined;
  let includeFailed = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") limit = Number(argv[++i]);
    else if (argv[i] === "--retry" || argv[i] === "--include-failed") includeFailed = true;
  }
  return { limit, includeFailed };
}

async function main() {
  const { limit, includeFailed } = parseArgs(process.argv.slice(2));

  const summary = await syncPending({
    limit,
    includeFailed,
    onProgress: (e) => {
      const tag = e.status === "DOWNLOADED" ? "ok " : e.status === "UNAVAILABLE" ? "gone" : "FAIL";
      const extra = e.message ? ` — ${e.message.split("\n")[0]}` : "";
      console.log(`[${e.index}/${e.total}] ${tag} ${e.shortcode}${extra}`);
    },
  });

  console.log("\nSync complete:");
  console.log(`  downloaded:  ${summary.downloaded}`);
  console.log(`  failed:      ${summary.failed}`);
  console.log(`  unavailable: ${summary.unavailable}`);
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
