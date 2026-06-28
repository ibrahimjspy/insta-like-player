import { NextRequest, NextResponse } from "next/server";

import { downloadReelFromUrl } from "@/lib/sync";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";

  if (!url.trim()) {
    return NextResponse.json({ error: "Enter a reel URL to download" }, { status: 400 });
  }

  try {
    const result = await downloadReelFromUrl(url);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
