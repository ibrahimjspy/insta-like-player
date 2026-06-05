import type { ParsedLike } from "@/lib/platforms/types";

const VIDEO_URL_RE =
  /facebook\.com\/(?:reel\/|watch\/?\?v=|video\.php\?v=)|fb\.watch\/|fb\.com\/watch/i;

const REEL_ID_RE = /facebook\.com\/reel\/(\d+)/i;
const WATCH_ID_RE = /[?&]v=(\d+)/i;
const FBWATCH_ID_RE = /fb\.watch\/([A-Za-z0-9_-]+)/i;

/// Extracts a stable id from a Facebook video/reel URL.
export function extractFacebookVideoId(url: string): string | null {
  return (
    url.match(REEL_ID_RE)?.[1] ??
    url.match(WATCH_ID_RE)?.[1] ??
    url.match(FBWATCH_ID_RE)?.[1] ??
    null
  );
}

export function normalizeFacebookUrl(href: string): string {
  return href.split(/[?#]/)[0];
}

export function isFacebookVideoUrl(url: string): boolean {
  return VIDEO_URL_RE.test(url) && extractFacebookVideoId(url) !== null;
}

interface StringListItem {
  href?: string;
  timestamp?: number;
}

interface LabelValue {
  label?: string;
  value?: string;
  href?: string;
}

function parseFacebookHref(
  href: string,
  meta: { creatorUsername: string | null; likedAt: Date | null; caption: string | null },
): ParsedLike | null {
  if (!isFacebookVideoUrl(href)) return null;
  const shortcode = extractFacebookVideoId(href);
  if (!shortcode) return null;
  return {
    platform: "FACEBOOK",
    shortcode,
    reelUrl: normalizeFacebookUrl(href),
    creatorUsername: meta.creatorUsername,
    likedAt: meta.likedAt,
    caption: meta.caption,
  };
}

function hrefsFromUnknown(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    if (value.includes("facebook.com") || value.includes("fb.watch")) out.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const key of ["href", "uri", "url", "value"]) {
    const v = obj[key];
    if (typeof v === "string") hrefsFromUnknown(v, out);
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach((item) => hrefsFromUnknown(item, out));
    else if (v && typeof v === "object") hrefsFromUnknown(v, out);
  }
}

function parseLabelValueEntry(entry: Record<string, unknown>): ParsedLike | null {
  const values = (entry.label_values as LabelValue[]) ?? [];
  const urlItem = values.find((v) => v.label === "URL" && (v.href || v.value));
  const href = urlItem?.href || urlItem?.value;
  if (!href) return null;

  const caption = values.find((v) => v.label === "Caption")?.value ?? null;
  let creatorUsername: string | null = null;
  const owner = values.find((v) => (v as { title?: string }).title === "Owner");
  for (const group of (owner as { dict?: { dict?: LabelValue[] }[] })?.dict ?? []) {
    const username = group.dict?.find((d) => d.label === "Username")?.value;
    if (username) {
      creatorUsername = username;
      break;
    }
  }

  const ts = typeof entry.timestamp === "number" ? entry.timestamp : null;
  return parseFacebookHref(href, {
    creatorUsername,
    likedAt: ts ? new Date(ts * 1000) : null,
    caption: caption || null,
  });
}

function parseLegacyEntry(entry: Record<string, unknown>): ParsedLike[] {
  const title = typeof entry.title === "string" ? entry.title : null;
  const list = (entry.string_list_data as StringListItem[]) ?? [];
  const likes: ParsedLike[] = [];

  for (const item of list) {
    const href = item.href;
    if (!href) continue;
    const ts = typeof item.timestamp === "number" ? item.timestamp : null;
    const like = parseFacebookHref(href, {
      creatorUsername: title,
      likedAt: ts ? new Date(ts * 1000) : null,
      caption: null,
    });
    if (like) likes.push(like);
  }

  return likes;
}

function parseReactionEntry(entry: Record<string, unknown>): ParsedLike[] {
  const ts =
    typeof entry.timestamp === "number"
      ? new Date(entry.timestamp * 1000)
      : typeof entry.timestamp_ms === "number"
        ? new Date(entry.timestamp_ms)
        : null;

  const hrefs: string[] = [];
  hrefsFromUnknown(entry, hrefs);

  const title = typeof entry.title === "string" ? entry.title : null;
  const likes: ParsedLike[] = [];

  for (const href of hrefs) {
    const like = parseFacebookHref(href, {
      creatorUsername: title,
      likedAt: ts,
      caption: title,
    });
    if (like) likes.push(like);
  }

  return likes;
}

/// Parses Facebook's `likes_and_reactions/posts_and_comments.json` (and similar).
export function parseFacebookLikes(raw: unknown): ParsedLike[] {
  const root = raw as Record<string, unknown>;
  const entries =
    (root?.reactions_v2 as unknown[]) ??
    (root?.reactions as unknown[]) ??
    (root?.likes_media_likes as unknown[]) ??
    (Array.isArray(raw) ? (raw as unknown[]) : []);

  const likes: ParsedLike[] = [];
  const seen = new Set<string>();

  const push = (like: ParsedLike | null) => {
    if (!like || seen.has(like.shortcode)) return;
    seen.add(like.shortcode);
    likes.push(like);
  };

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    if (Array.isArray(e.label_values)) {
      push(parseLabelValueEntry(e));
      continue;
    }

    if (Array.isArray(e.string_list_data)) {
      for (const like of parseLegacyEntry(e)) push(like);
      continue;
    }

    for (const like of parseReactionEntry(e)) push(like);
  }

  return likes;
}
