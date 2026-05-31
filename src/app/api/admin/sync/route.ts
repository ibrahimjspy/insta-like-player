import { NextRequest, NextResponse } from "next/server";

import { getSyncState, startSync } from "@/lib/sync-runner";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getSyncState());
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const includeFailed = Boolean(body?.includeFailed);
  const limit = typeof body?.limit === "number" ? body.limit : undefined;

  const state = startSync({ includeFailed, limit });
  return NextResponse.json(state);
}
