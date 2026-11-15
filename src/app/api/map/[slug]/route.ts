import { db } from "@/lib/db";

/** The park map image for a property. Shown to guests on the booking page, so it is public. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const map = await db.propertyMap.findFirst({ where: { property: { slug } } });
  if (!map) return new Response("No map", { status: 404 });
  return new Response(new Uint8Array(map.data), { headers: { "content-type": map.mime, "cache-control": "public, max-age=60" } });
}
