import type { ParsedLike } from "@/lib/platforms/types";

const REEL_ID_RE = /facebook\.com\/reel\/(\d+)/i;
// e.g. facebook.com/<user>/videos/1888877651473929/ (the saved-video shape)
const VIDEOS_PATH_RE = /facebook\.com\/[^/]+\/videos\/(\d+)/i;
const VIDEO_PHP_RE = /facebook\.com\/watch\/?\?v=(\d+)|[?&]v=(\d+)/i;
const FBWATCH_ID_RE = /fb\.watch\/([A-Za-z0-9_-]+)/i;

/// Extracts a stable id from a Facebook video/reel URL. Returns null for
/// non-video Facebook links (pages, profiles, plain posts).
export function extractFacebookVideoId(url: string): string | null {
  const watch = url.match(VIDEO_PHP_RE);
  return (
    url.match(REEL_ID_RE)?.[1] ??
    url.match(VIDEOS_PATH_RE)?.[1] ??
    watch?.[1] ??
    watch?.[2] ??
    url.match(FBWATCH_ID_RE)?.[1] ??
    null
  );
}

export function normalizeFacebookUrl(href: string): string {
  return href.split(/[?#]/)[0];
}

export function isFacebookVideoUrl(url: string): boolean {
  if (!/facebook\.com|fb\.watch/i.test(url)) return false;
  return extractFacebookVideoId(url) !== null;
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

/// Recursively extracts every Facebook video like nested anywhere in an entry.
/// Covers `collections.json` (saved videos nested in dict-of-dicts) and any
/// other shape where the URL isn't at a predictable top-level key.
function parseNestedEntry(entry: Record<string, unknown>): ParsedLike[] {
  const ts =
    typeof entry.timestamp === "number"
      ? new Date(entry.timestamp * 1000)
      : typeof entry.timestamp_ms === "number"
        ? new Date(entry.timestamp_ms)
        : null;

  const hrefs: string[] = [];
  hrefsFromUnknown(entry, hrefs);

  const likes: ParsedLike[] = [];
  for (const href of hrefs) {
    const like = parseFacebookHref(href, {
      creatorUsername: null,
      likedAt: ts,
      caption: null,
    });
    if (like) likes.push(like);
  }
  return likes;
}

/// Parses Facebook video likes/saves from a "Download your information" JSON
/// export. Handles several shapes Meta has shipped:
///   - likes_and_reactions: reactions_v2 / reactions / likes_media_likes
///   - saved_items_and_collections/collections.json: top-level array of
///     collections with deeply nested {label:"URL"} video links
///   - saved_items_and_collections/your_saved_items.json: saves_v2
export function parseFacebookLikes(raw: unknown): ParsedLike[] {
  const root = raw as Record<string, unknown>;
  const entries =
    (root?.reactions_v2 as unknown[]) ??
    (root?.reactions as unknown[]) ??
    (root?.likes_media_likes as unknown[]) ??
    (root?.saves_v2 as unknown[]) ??
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

    // Prefer a precise top-level URL when present (keeps creator/caption).
    if (Array.isArray(e.label_values)) {
      const precise = parseLabelValueEntry(e);
      if (precise) push(precise);
    }

    if (Array.isArray(e.string_list_data)) {
      for (const like of parseLegacyEntry(e)) push(like);
      continue;
    }

    // Catch-all: recurse for any nested video URLs not already captured.
    for (const like of parseNestedEntry(e)) push(like);
  }

  return likes;
}
