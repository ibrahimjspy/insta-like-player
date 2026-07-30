import { getOfflineCandidates } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function HEAD() {
  return new Response(null, { status: 204 });
}

export async function GET() {
  const candidates = await getOfflineCandidates();
  return Response.json(candidates);
}
