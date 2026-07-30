import { getCollections } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const collections = await getCollections();
  return Response.json(collections.map(({ id, name }) => ({ id, name })));
}
