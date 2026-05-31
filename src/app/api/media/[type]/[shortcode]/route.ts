import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";

import { prisma } from "@/lib/db";
import { contentTypeFor, resolveMediaPath } from "@/lib/media";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; shortcode: string }> },
) {
  const { type, shortcode } = await params;
  if (type !== "video" && type !== "thumb") {
    return new Response("Not found", { status: 404 });
  }

  const reel = await prisma.reel.findUnique({
    where: { shortcode },
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

  // Range requests power video seeking and efficient streaming.
  if (range && type === "video") {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    const stream = createReadStream(absolute, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
      },
    });
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
