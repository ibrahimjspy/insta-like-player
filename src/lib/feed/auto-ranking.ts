import type { FeedItem } from "./feed-pagination";

const STORAGE_KEY = "ilp_manual_interest";
type Interest = Record<string, number>;

export function readInterest(): Interest {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, score]) =>
      typeof score === "number" && Number.isFinite(score) && Math.abs(score) <= 3,
    )) as Interest;
  } catch { return {}; }
}

/** Only deliberate browsing teaches interest; unattended loops are not approval. */
export function recordManualInterest(reelId: string, watchedSec: number, durationSec: number | null, wasAuto: boolean) {
  if (wasAuto || !Number.isFinite(watchedSec) || watchedSec < 0.5) return;
  const completion = durationSec && durationSec > 0 ? watchedSec / durationSec : 0;
  const signal = completion >= 0.8 || watchedSec >= 30 ? 1
    : watchedSec < 4 && (durationSec === null || durationSec >= 8) ? -1 : 0;
  if (!signal) return;
  const interest = readInterest();
  const score = Math.max(-3, Math.min(3, (interest[reelId] ?? 0) + signal));
  delete interest[reelId];
  interest[reelId] = score;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(interest).slice(-1000))));
  } catch { /* Keep playing if storage is full or denied. */ }
}

/** Keep the current clip/history fixed and rank only the remaining For you queue. */
export function rankAutoQueue(items: FeedItem[], activeKey: string | null, order: string, auto: boolean, interest: Interest): FeedItem[] {
  if (!auto || order !== "random") return items;
  const index = items.findIndex((item) => item.feedKey === activeKey);
  const score = (item: FeedItem) => (item.isFavorite ? 2 : 0) + (interest[item.id] ?? 0);
  const upcoming = items.slice(index + 1).sort((a, b) => score(b) - score(a));
  const next = [...items.slice(0, index + 1), ...upcoming];
  return next.every((item, i) => item === items[i]) ? items : next;
}
