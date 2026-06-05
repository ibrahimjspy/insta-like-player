import path from "node:path";
import type { Platform } from "@prisma/client";
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
  /// Legacy single cookies file — treated as Instagram when per-platform vars are unset.
  YTDLP_COOKIES_FILE: z.string().optional(),
  YTDLP_COOKIES_INSTAGRAM: z.string().optional(),
  YTDLP_COOKIES_TIKTOK: z.string().optional(),
  YTDLP_COOKIES_FACEBOOK: z.string().optional(),
  /// Browser to impersonate (TLS fingerprint) per platform. Requires a yt-dlp
  /// built with curl_cffi. TikTok in particular returns 403s without this.
  YTDLP_IMPERSONATE_INSTAGRAM: z.string().optional(),
  YTDLP_IMPERSONATE_TIKTOK: z.string().optional().default("chrome"),
  YTDLP_IMPERSONATE_FACEBOOK: z.string().optional(),
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
    cookies: {
      INSTAGRAM: parsed.YTDLP_COOKIES_INSTAGRAM ?? parsed.YTDLP_COOKIES_FILE,
      TIKTOK: parsed.YTDLP_COOKIES_TIKTOK,
      FACEBOOK: parsed.YTDLP_COOKIES_FACEBOOK,
    } satisfies Record<Platform, string | undefined>,
    impersonate: {
      INSTAGRAM: parsed.YTDLP_IMPERSONATE_INSTAGRAM,
      TIKTOK: parsed.YTDLP_IMPERSONATE_TIKTOK,
      FACEBOOK: parsed.YTDLP_IMPERSONATE_FACEBOOK,
    } satisfies Record<Platform, string | undefined>,
  },
  sync: {
    // Downloads run sequentially (one at a time) to stay polite to platforms;
    // pacing is controlled by rateLimitMs rather than parallelism.
    rateLimitMs: parsed.SYNC_RATE_LIMIT_MS,
    maxRetries: parsed.SYNC_MAX_RETRIES,
    reelsOnly: parsed.SYNC_REELS_ONLY !== "false",
  },
} as const;

export type AppConfig = typeof config;

export function cookiesForPlatform(platform: Platform): string | undefined {
  return config.ytDlp.cookies[platform];
}

export function impersonateForPlatform(platform: Platform): string | undefined {
  return config.ytDlp.impersonate[platform];
}
