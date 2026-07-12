import { parseVideoUrl } from "@/lib/platforms";
import { downloadReelFromUrl, type DownloadUrlResult } from "@/lib/sync";

/// In-process tracker for one-off URL downloads so the admin UI can enqueue
/// a link and poll progress without blocking the request. Lives on globalThis
/// to survive Next.js dev hot-reloads (same pattern as sync-runner).

export interface DownloadUrlJobState {
  running: boolean;
  currentUrl: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  queueLength: number;
  lastEvent: string | null;
  result: DownloadUrlResult | null;
  error: string | null;
  recent: DownloadUrlResult[];
}

const MAX_RECENT = 8;

const globalForDownload = globalThis as unknown as {
  __downloadUrlState?: DownloadUrlJobState;
  __downloadUrlQueue?: string[];
};

const state: DownloadUrlJobState =
  globalForDownload.__downloadUrlState ??
  (globalForDownload.__downloadUrlState = {
    running: false,
    currentUrl: null,
    startedAt: null,
    finishedAt: null,
    queueLength: 0,
    lastEvent: null,
    result: null,
    error: null,
    recent: [],
  });

const queue: string[] =
  globalForDownload.__downloadUrlQueue ?? (globalForDownload.__downloadUrlQueue = []);

export function getDownloadUrlState(): DownloadUrlJobState {
  state.queueLength = queue.length;
  return state;
}

function pushRecent(result: DownloadUrlResult) {
  state.recent = [result, ...state.recent].slice(0, MAX_RECENT);
}

async function drainQueue() {
  if (state.running) return;
  state.running = true;
  state.error = null;

  while (queue.length > 0) {
    const url = queue.shift()!;
    state.queueLength = queue.length;
    state.currentUrl = url;
    state.startedAt = Date.now();
    state.finishedAt = null;
    state.result = null;
    state.lastEvent = "Downloading…";

    try {
      const result = await downloadReelFromUrl(url);
      state.result = result;
      pushRecent(result);
      state.lastEvent = result.alreadyDownloaded
        ? `Already had ${result.platform.toLowerCase()}:${result.shortcode}`
        : `${result.status.toLowerCase()} ${result.platform.toLowerCase()}:${result.shortcode}`;
      if (result.status !== "DOWNLOADED") {
        state.error = result.message ?? `Download ${result.status.toLowerCase()}`;
      } else {
        state.error = null;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      state.error = message;
      state.result = null;
      state.lastEvent = message;
    } finally {
      state.finishedAt = Date.now();
      state.currentUrl = null;
    }
  }

  state.running = false;
  state.queueLength = 0;
}

/// Validates and enqueues a URL for background download. Returns state right
/// away; yt-dlp work continues off the request.
export function enqueueDownloadUrl(rawUrl: string): DownloadUrlJobState {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Enter a reel URL to download");
  }

  const parsed = parseVideoUrl(trimmed, new Date());
  if (!parsed) {
    throw new Error(
      "Enter a supported video URL, for example an Instagram /reel/ or /p/ link.",
    );
  }

  const duplicate =
    queue.includes(trimmed) ||
    (state.running && state.currentUrl === trimmed);
  if (!duplicate) {
    queue.push(trimmed);
  }

  state.queueLength = queue.length;
  state.lastEvent = duplicate
    ? `Already queued ${parsed.platform.toLowerCase()}:${parsed.shortcode}`
    : `Queued ${parsed.platform.toLowerCase()}:${parsed.shortcode}`;

  void drainQueue();
  return getDownloadUrlState();
}
