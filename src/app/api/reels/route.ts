import { NextRequest, NextResponse } from "next/server";

import { getFeed, type FeedOrder } from "@/lib/queries";

export const runtime = "nodejs";

const ORDERS: FeedOrder[] = ["recent", "oldest", "random"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orderParam = searchParams.get("order") as FeedOrder | null;
  const order = orderParam && ORDERS.includes(orderParam) ? orderParam : "recent";
  const cursor = searchParams.get("cursor");

  const page = await getFeed({ order, cursor });
  return NextResponse.json(page);
}
