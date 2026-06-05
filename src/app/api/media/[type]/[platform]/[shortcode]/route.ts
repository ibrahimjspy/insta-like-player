import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";

import { prisma } from "@/lib/db";
import { contentTypeFor, parseByteRange, resolveMediaPath } from "@/lib/media";
import { platformFromSlug } from "@/lib/platforms";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; platform: string; shortcode: string }> },
) {
  const { type, platform: platformSlug, shortcode } = await params;
  if (type !== "video" && type !== "thumb") {
    return new Response("Not found", { status: 404 });
  }

  const platform = platformFromSlug(platformSlug);
  if (!platform) return new Response("Not found", { status: 404 });

  const reel = await prisma.reel.findUnique({
    where: { platform_shortcode: { platform, shortcode } },
    select: { videoPath: true, thumbnailPath: true },
  });

  const filename = type === "video" ? reel?.videoPath : reel?.thumbnailPath;
  if (!filename) return new Response("Not found", { status: 404 });

  const absolute = resolveMediaPath(filename);
  if (!absolute) return new Response("Forbidden", { status: 403 });

  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat) return new Response("Not found", { status: 404 });

  const mime = contentTypeFor(filename);
  const range = request.headers.get("range");

  if (range && type === "video") {
    const parsed = parseByteRange(range, stat.size);

    if (parsed?.kind === "unsatisfiable") {
      return new Response("Requested Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }

    if (parsed?.kind === "ok") {
      const { start, end } = parsed;
      const stream = createReadStream(absolute, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  const stream = createReadStream(absolute);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
