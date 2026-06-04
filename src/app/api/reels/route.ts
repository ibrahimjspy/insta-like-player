import { NextRequest, NextResponse } from "next/server";

import { getFeed, type FeedOrder } from "@/lib/queries";

export const runtime = "nodejs";

const ORDERS: FeedOrder[] = ["recent", "oldest", "random"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orderParam = searchParams.get("order") as FeedOrder | null;
  const order = orderParam && ORDERS.includes(orderParam) ? orderParam : "recent";
  const cursor = searchParams.get("cursor");
  const excludeRaw = searchParams.get("exclude");
  const excludeIds = excludeRaw
    ? excludeRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const page = await getFeed({ order, cursor, excludeIds });
  return NextResponse.json(page);
}
