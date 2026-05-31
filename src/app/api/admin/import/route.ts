import { NextRequest, NextResponse } from "next/server";

import { importLikes, parseLikedPosts } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "File is not valid JSON" }, { status: 400 });
  }

  const likes = parseLikedPosts(json);
  if (likes.length === 0) {
    return NextResponse.json(
      { error: "No liked reels found. Is this the liked_posts.json export?" },
      { status: 422 },
    );
  }

  const result = await importLikes(likes);
  return NextResponse.json(result);
}
