import { NextRequest, NextResponse } from "next/server";

import { enqueueDownloadUrl, getDownloadUrlState } from "@/lib/download-url-runner";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getDownloadUrlState());
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";

  try {
    const state = enqueueDownloadUrl(url);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
