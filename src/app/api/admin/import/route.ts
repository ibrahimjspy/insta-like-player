import type { Platform } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { importLikes } from "@/lib/ingest";
import { exportHint, parseExport } from "@/lib/platforms";

export const runtime = "nodejs";

const PLATFORMS = new Set<Platform>(["INSTAGRAM", "TIKTOK", "FACEBOOK"]);

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const platformRaw = form?.get("platform");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const platform =
    typeof platformRaw === "string" && PLATFORMS.has(platformRaw as Platform)
      ? (platformRaw as Platform)
      : "INSTAGRAM";

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "File is not valid JSON" }, { status: 400 });
  }

  const likes = parseExport(platform, json);
  if (likes.length === 0) {
    return NextResponse.json(
      { error: `No liked videos found. Is this ${exportHint(platform)}?` },
      { status: 422 },
    );
  }

  const result = await importLikes(likes);
  return NextResponse.json(result);
}
