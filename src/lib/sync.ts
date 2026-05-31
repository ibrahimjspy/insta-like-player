import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { parseHashtags } from "@/lib/instagram";

const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm", ".mov"]);
const THUMB_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface SyncOptions {
  /// Max number of reels to process this run (undefined = all pending).
  limit?: number;
  /// Also re-attempt reels previously marked FAILED.
  includeFailed?: boolean;
  /// Progress callback, called once per reel after it settles.
  onProgress?: (event: SyncProgress) => void;
}

export interface SyncProgress {
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
    "3",
  ];
  if (cookiesFile) {
    args.push("--cookies", cookiesFile);
  }
  return args;
}

/// Classifies a list of filenames into the video / thumbnail / info outputs
/// produced by yt-dlp for a given shortcode. Pure and unit-testable.
export function classifyOutputs(files: string[], shortcode: string) {
  let video: string | undefined;
  let thumb: string | undefined;
  let info: string | undefined;

  for (const file of files) {
    if (!file.startsWith(`${shortcode}.`)) continue;
    const ext = path.extname(file).toLowerCase();
    if (file.endsWith(".info.json")) info = file;
    else if (VIDEO_EXTS.has(ext)) video = file;
    else if (THUMB_EXTS.has(ext)) thumb = file;
  }

  return { video, thumb, info };
}

/// Runs yt-dlp once for a reel. Resolves on exit code 0, rejects otherwise
/// with the captured stderr as the message.
function runYtDlp(url: string, shortcode: string): Promise<void> {
  const outputTemplate = path.join(config.mediaDir, `${shortcode}.%(ext)s`);
  const args = buildYtDlpArgs(url, outputTemplate, config.ytDlp.cookiesFile);
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

/// Finds the produced files for a shortcode in the media directory.
async function collectOutputs(shortcode: string) {
  const files = await fs.readdir(config.mediaDir);
  return classifyOutputs(files, shortcode);
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

/// Detects "this content is gone" errors so we can mark UNAVAILABLE instead of
/// FAILED (no point retrying deleted/private posts).
export function isUnavailable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not available") ||
    m.includes("login required") ||
    m.includes("private") ||
    m.includes("removed") ||
    m.includes("404")
  );
}

/// Downloads a single reel and persists its media + metadata.
async function downloadReel(reel: {
  id: string;
  shortcode: string;
  reelUrl: string;
  creatorId: string | null;
}): Promise<"DOWNLOADED"> {
  await runYtDlp(reel.reelUrl, reel.shortcode);

  const { video, thumb, info } = await collectOutputs(reel.shortcode);
  if (!video) {
    throw new Error("yt-dlp finished but no video file was produced");
  }

  const meta = await readInfo(info);
  const caption = meta.description ?? null;
  const username = meta.uploader ?? meta.channel ?? meta.uploader_id ?? null;

  // Backfill creator from metadata if the export didn't include it.
  let creatorId = reel.creatorId;
  if (!creatorId && username) {
    const creator = await prisma.creator.upsert({
      where: { username },
      create: { username },
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

/// Processes pending reels sequentially with a polite rate limit. Returns a
/// summary; never throws for per-reel failures (those are recorded on the row).
export async function syncPending(options: SyncOptions = {}): Promise<SyncSummary> {
  await fs.mkdir(config.mediaDir, { recursive: true });

  const statuses = options.includeFailed
    ? (["PENDING", "FAILED"] as const)
    : (["PENDING"] as const);

  const reels = await prisma.reel.findMany({
    where: { status: { in: [...statuses] } },
    orderBy: { likedAt: "desc" },
    take: options.limit,
    select: { id: true, shortcode: true, reelUrl: true, creatorId: true },
  });

  const summary: SyncSummary = {
    total: reels.length,
    downloaded: 0,
    failed: 0,
    unavailable: 0,
  };

  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    try {
      await downloadReel(reel);
      summary.downloaded += 1;
      options.onProgress?.({
        shortcode: reel.shortcode,
        status: "DOWNLOADED",
        index: i + 1,
        total: reels.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = isUnavailable(message) ? "UNAVAILABLE" : "FAILED";
      if (status === "UNAVAILABLE") summary.unavailable += 1;
      else summary.failed += 1;

      await prisma.reel.update({
        where: { id: reel.id },
        data: { status, failReason: message.slice(0, 1000) },
      });

      options.onProgress?.({
        shortcode: reel.shortcode,
        status,
        index: i + 1,
        total: reels.length,
        message,
      });
    }

    if (i < reels.length - 1 && config.sync.rateLimitMs > 0) {
      await sleep(config.sync.rateLimitMs);
    }
  }

  return summary;
}
