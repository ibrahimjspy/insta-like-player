import path from "node:path";
import { z } from "zod";

// Standalone scripts (ingest/sync) don't go through Next's env loader, so we
// load .env manually when present. Next.js loads its own env, so this is a
// harmless no-op there. Guarded because process.loadEnvFile throws if missing.
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall back to the real environment / defaults below.
}

const schema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgresql://insta:insta@localhost:5432/insta_like_player?schema=public"),
  MEDIA_DIR: z.string().default("./data/media"),
  FEED_PAGE_SIZE: z.coerce.number().int().positive().default(10),
  YTDLP_PATH: z.string().default("yt-dlp"),
  YTDLP_COOKIES_FILE: z.string().optional(),
  SYNC_RATE_LIMIT_MS: z.coerce.number().int().nonnegative().default(4000),
  SYNC_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  /// When true (default), sync only downloads /reel/, /reels/, and /tv/ URLs.
  SYNC_REELS_ONLY: z.string().optional(),
});

const parsed = schema.parse(process.env);

/// Centralised, typed application configuration. Import this instead of
/// reading process.env directly so defaults and types live in one place.
export const config = {
  databaseUrl: parsed.DATABASE_URL,
  /// Absolute path to the media directory (created lazily by the sync worker).
  mediaDir: path.resolve(parsed.MEDIA_DIR),
  feedPageSize: parsed.FEED_PAGE_SIZE,
  ytDlp: {
    binary: parsed.YTDLP_PATH,
    cookiesFile: parsed.YTDLP_COOKIES_FILE,
  },
  sync: {
    // Downloads run sequentially (one at a time) to stay polite to Instagram;
    // pacing is controlled by rateLimitMs rather than parallelism.
    rateLimitMs: parsed.SYNC_RATE_LIMIT_MS,
    maxRetries: parsed.SYNC_MAX_RETRIES,
    reelsOnly: parsed.SYNC_REELS_ONLY !== "false",
  },
} as const;

export type AppConfig = typeof config;
