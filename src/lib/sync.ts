import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Platform, ReelStatus } from "@prisma/client";

import { config, cookiesForPlatform, impersonateForPlatform } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  mediaStorageKey,
  parseHashtags,
  parseVideoUrl,
  sureShotVideoWhere,
} from "@/lib/platforms";

/// Recorded when videos-only sync skips non-video likes.
export const REELS_ONLY_SKIP_REASON =
  "Videos-only sync: skipped non-video like (photo, link, or unsupported post type)";

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm", ".mov"]);
const THUMB_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface SyncOptions {
  /// Max number of reels to process this run (undefined = all pending).
  limit?: number;
  /// Also re-attempt reels previously marked FAILED.
  includeFailed?: boolean;
  /// When true (default), only download sure-shot video URLs per platform.
  reelsOnly?: boolean;
  /// Progress callback, called once per reel after it settles.
  onProgress?: (event: SyncProgress) => void;
}

export interface SyncProgress {
  platform: Platform;
  shortcode: string;
  status: "DOWNLOADED" | "FAILED" | "UNAVAILABLE";
  index: number;
  total: number;
  message?: string;
}

export interface SyncSummary {
  total: number;
  downloaded: number;
  failed: number;
  unavailable: number;
  /// Non-video likes skipped before yt-dlp (videos-only mode).
  skippedPosts: number;
}

type DownloadableReel = {
  id: string;
  platform: Platform;
  shortcode: string;
  reelUrl: string;
  creatorId: string | null;
};

export interface DownloadUrlResult {
  reelId: string;
  platform: Platform;
  shortcode: string;
  reelUrl: string;
  status: Extract<ReelStatus, "DOWNLOADED" | "FAILED" | "UNAVAILABLE">;
  alreadyDownloaded: boolean;
  message?: string;
}

interface YtDlpInfo {
  description?: string;
  uploader?: string;
  channel?: string;
  uploader_id?: string;
  duration?: number;
  width?: number;
  height?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/// Builds the yt-dlp argument list for a single reel download. Pure so it can
/// be unit-tested without spawning a process.
export function buildYtDlpArgs(
  url: string,
  outputTemplate: string,
  cookiesFile?: string,
  retries: number = config.sync.maxRetries,
  impersonate?: string,
): string[] {
  const args = [
    url,
    "-o",
    outputTemplate,
    "--no-progress",
    "--no-warnings",
    "--write-info-json",
    "--write-thumbnail",
    "--convert-thumbnails",
    "jpg",
    "--merge-output-format",
    "mp4",
    "--retries",
    String(retries),
  ];
  if (cookiesFile) {
    args.push("--cookies", cookiesFile);
  }
  if (impersonate) {
    args.push("--impersonate", impersonate);
  }
  return args;
}

/// Classifies a list of filenames into the video / thumbnail / info outputs
/// produced by yt-dlp for a given storage key. Pure and unit-testable.
export function classifyOutputs(files: string[], storageKey: string) {
  let video: string | undefined;
  let thumb: string | undefined;
  let info: string | undefined;

  for (const file of files) {
    if (!file.startsWith(`${storageKey}.`)) continue;
    const ext = path.extname(file).toLowerCase();
    if (file.endsWith(".info.json")) info = file;
    else if (VIDEO_EXTS.has(ext)) video = file;
    else if (THUMB_EXTS.has(ext)) thumb = file;
  }

  return { video, thumb, info };
}

/// Runs yt-dlp once for a reel. Resolves on exit code 0, rejects otherwise
/// with the captured stderr as the message.
function runYtDlp(
  url: string,
  storageKey: string,
  platform: Platform,
): Promise<void> {
  const outputTemplate = path.join(config.mediaDir, `${storageKey}.%(ext)s`);
  const args = buildYtDlpArgs(
    url,
    outputTemplate,
    cookiesForPlatform(platform),
    config.sync.maxRetries,
    impersonateForPlatform(platform),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(config.ytDlp.binary, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      reject(
        new Error(
          err.message.includes("ENOENT")
            ? `yt-dlp not found at "${config.ytDlp.binary}". Install it (e.g. brew install yt-dlp) or set YTDLP_PATH.`
            : err.message,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

/// Finds the produced files for a storage key in the media directory.
async function collectOutputs(storageKey: string) {
  const files = await fs.readdir(config.mediaDir);
  return classifyOutputs(files, storageKey);
}

async function readInfo(infoFile: string | undefined): Promise<YtDlpInfo> {
  if (!infoFile) return {};
  try {
    const raw = await fs.readFile(path.join(config.mediaDir, infoFile), "utf8");
    return JSON.parse(raw) as YtDlpInfo;
  } catch {
    return {};
  }
}

/// Detects errors that mean "not worth retrying" so we mark UNAVAILABLE instead
/// of FAILED.
export function isUnavailable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not available") ||
    m.includes("login required") ||
    m.includes("private") ||
    m.includes("removed") ||
    m.includes("404") ||
    m.includes("no video") ||
    m.includes("there is no video") ||
    m.includes("unable to extract shared data") ||
    m.includes("no media found")
  );
}

/// Downloads a single reel and persists its media + metadata.
async function downloadReel(reel: DownloadableReel): Promise<"DOWNLOADED"> {
  const storageKey = mediaStorageKey(reel.platform, reel.shortcode);
  await runYtDlp(reel.reelUrl, storageKey, reel.platform);

  const { video, thumb, info } = await collectOutputs(storageKey);
  if (!video) {
    throw new Error("No video in this post (photo or image-only carousel)");
  }

  const meta = await readInfo(info);
  const caption = meta.description ?? null;
  const username = meta.uploader ?? meta.channel ?? meta.uploader_id ?? null;

  let creatorId = reel.creatorId;
  if (!creatorId && username) {
    const creator = await prisma.creator.upsert({
      where: {
        platform_username: { platform: reel.platform, username },
      },
      create: { platform: reel.platform, username },
      update: {},
    });
    creatorId = creator.id;
  }

  const tags = parseHashtags(caption);

  await prisma.reel.update({
    where: { id: reel.id },
    data: {
      caption,
      creatorId,
      videoPath: video,
      thumbnailPath: thumb ?? null,
      durationSec: meta.duration ? Math.round(meta.duration) : null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      status: "DOWNLOADED",
      failReason: null,
      downloadedAt: new Date(),
      hashtags: {
        connectOrCreate: tags.map((tag) => ({
          where: { tag },
          create: { tag },
        })),
      },
    },
  });

  return "DOWNLOADED";
}

async function settleReelDownload(
  reel: DownloadableReel,
): Promise<{ status: DownloadUrlResult["status"]; message?: string }> {
  try {
    await downloadReel(reel);
    return { status: "DOWNLOADED" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = isUnavailable(message) ? "UNAVAILABLE" : "FAILED";

    await prisma.reel.update({
      where: { id: reel.id },
      data: { status, failReason: message.slice(0, 1000) },
    });

    return { status, message };
  }
}

/// Creates or refreshes one manually supplied video URL, then downloads it
/// immediately with the same yt-dlp/cookie path used by batch sync.
export async function downloadReelFromUrl(rawUrl: string): Promise<DownloadUrlResult> {
  const like = parseVideoUrl(rawUrl, new Date());
  if (!like) {
    throw new Error(
      "Enter a supported video URL, for example an Instagram /reel/ link.",
    );
  }

  await fs.mkdir(config.mediaDir, { recursive: true });

  const existing = await prisma.reel.findUnique({
    where: {
      platform_shortcode: { platform: like.platform, shortcode: like.shortcode },
    },
    select: {
      id: true,
      platform: true,
      shortcode: true,
      reelUrl: true,
      creatorId: true,
      status: true,
      videoPath: true,
    },
  });

  const alreadyDownloaded = existing?.status === "DOWNLOADED" && Boolean(existing.videoPath);
  const reel = existing
    ? await prisma.reel.update({
        where: { id: existing.id },
        data: {
          reelUrl: like.reelUrl,
          ...(alreadyDownloaded ? {} : { status: "PENDING", failReason: null }),
        },
        select: {
          id: true,
          platform: true,
          shortcode: true,
          reelUrl: true,
          creatorId: true,
        },
      })
    : await prisma.reel.create({
        data: {
          platform: like.platform,
          shortcode: like.shortcode,
          reelUrl: like.reelUrl,
          caption: like.caption,
          likedAt: like.likedAt,
          status: "PENDING",
        },
        select: {
          id: true,
          platform: true,
          shortcode: true,
          reelUrl: true,
          creatorId: true,
        },
      });

  if (alreadyDownloaded) {
    return {
      reelId: reel.id,
      platform: reel.platform,
      shortcode: reel.shortcode,
      reelUrl: reel.reelUrl,
      status: "DOWNLOADED",
      alreadyDownloaded: true,
      message: "Already downloaded.",
    };
  }

  const result = await settleReelDownload(reel);
  return {
    reelId: reel.id,
    platform: reel.platform,
    shortcode: reel.shortcode,
    reelUrl: reel.reelUrl,
    status: result.status,
    alreadyDownloaded: false,
    message: result.message,
  };
}

/// Processes pending reels sequentially with a polite rate limit. Returns a
/// summary; never throws for per-reel failures (those are recorded on the row).
export async function syncPending(options: SyncOptions = {}): Promise<SyncSummary> {
  await fs.mkdir(config.mediaDir, { recursive: true });

  const reelsOnly = options.reelsOnly ?? config.sync.reelsOnly;
  const statuses = options.includeFailed
    ? (["PENDING", "FAILED"] as const)
    : (["PENDING"] as const);

  let skippedPosts = 0;
  if (reelsOnly) {
    const { count } = await prisma.reel.updateMany({
      where: {
        status: { in: [...statuses] },
        NOT: sureShotVideoWhere(),
      },
      data: { status: "UNAVAILABLE", failReason: REELS_ONLY_SKIP_REASON },
    });
    skippedPosts = count;
  }

  const reels = await prisma.reel.findMany({
    where: {
      status: { in: [...statuses] },
      ...(reelsOnly ? sureShotVideoWhere() : {}),
    },
    orderBy: { likedAt: "desc" },
    take: options.limit,
    select: {
      id: true,
      platform: true,
      shortcode: true,
      reelUrl: true,
      creatorId: true,
    },
  });

  const summary: SyncSummary = {
    total: reels.length,
    downloaded: 0,
    failed: 0,
    unavailable: 0,
    skippedPosts,
  };

  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    const result = await settleReelDownload(reel);
    if (result.status === "DOWNLOADED") {
      summary.downloaded += 1;
      options.onProgress?.({
        platform: reel.platform,
        shortcode: reel.shortcode,
        status: "DOWNLOADED",
        index: i + 1,
        total: reels.length,
      });
    } else {
      if (result.status === "UNAVAILABLE") summary.unavailable += 1;
      else summary.failed += 1;

      options.onProgress?.({
        platform: reel.platform,
        shortcode: reel.shortcode,
        status: result.status,
        index: i + 1,
        total: reels.length,
        message: result.message,
      });
    }

    if (i < reels.length - 1 && config.sync.rateLimitMs > 0) {
      await sleep(config.sync.rateLimitMs);
    }
  }

  return summary;
}
