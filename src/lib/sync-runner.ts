import { syncPending, type SyncOptions, type SyncSummary } from "@/lib/sync";

/// In-process tracker for a running sync so the admin UI can poll progress.
/// State lives on globalThis to survive Next.js dev hot-reloads. This is
/// intentionally simple — fine for a single-user, locally-run app.
export interface SyncState {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  progress: { index: number; total: number } | null;
  lastEvent: string | null;
  summary: SyncSummary | null;
  error: string | null;
}

const globalForSync = globalThis as unknown as { __syncState?: SyncState };

const state: SyncState =
  globalForSync.__syncState ??
  (globalForSync.__syncState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    progress: null,
    lastEvent: null,
    summary: null,
    error: null,
  });

export function getSyncState(): SyncState {
  return state;
}

/// Kicks off a sync in the background (does not block the request). Returns
/// the current state immediately. No-op if a sync is already running.
export function startSync(options: SyncOptions = {}): SyncState {
  if (state.running) return state;

  state.running = true;
  state.startedAt = Date.now();
  state.finishedAt = null;
  state.summary = null;
  state.error = null;
  state.progress = null;
  state.lastEvent = "Starting…";

  void syncPending({
    ...options,
    onProgress: (e) => {
      state.progress = { index: e.index, total: e.total };
      state.lastEvent = `${e.status} ${e.shortcode}`;
    },
  })
    .then((summary) => {
      state.summary = summary;
    })
    .catch((err: unknown) => {
      state.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      state.running = false;
      state.finishedAt = Date.now();
    });

  return state;
}
