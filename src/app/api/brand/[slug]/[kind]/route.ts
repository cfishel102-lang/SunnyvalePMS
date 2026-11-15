import { db } from "@/lib/db";

/** An uploaded logo. Public, because it appears on the guest booking pages. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await ctx.params;
  const asset = await db.brandAsset.findFirst({ where: { kind, property: { slug } } });
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "content-type": asset.mime,
      "cache-control": "public, max-age=300",
      // An uploaded SVG must only ever be treated as a picture.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}
