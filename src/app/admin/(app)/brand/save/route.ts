import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { FONTS, getBrand, type Brand } from "@/lib/brand";
import { db } from "@/lib/db";

const IMAGE = ["image/png", "image/svg+xml", "image/webp", "image/jpeg"];

/** Save the property's colours, fonts and logos. */
export async function POST(req: Request) {
  const { property } = await requireStaff();
  const form = await req.formData();
  const fail = (m: string): never => redirect(`/admin/brand?error=${encodeURIComponent(m)}`);
  const current = getBrand(property.brand);

  const colors = {} as Brand["colors"];
  for (const k of ["primary", "accent", "tint", "highlight"] as const) {
    const v = String(form.get(k) ?? "");
    if (!/^#[0-9a-f]{6}$/i.test(v)) return fail("Each colour must be a six-digit code such as #636F56.");
    colors[k] = v.toUpperCase();
  }
  const fonts = {} as Brand["fonts"];
  for (const k of ["heading", "label", "body"] as const) {
    const v = String(form.get(k) ?? "");
    if (!FONTS.includes(v)) return fail("Choose each font from the list.");
    fonts[k] = v;
  }

  const next: Brand = { colors, fonts, logo: current.logo, logoOnDark: current.logoOnDark };
  for (const kind of ["logo", "logoOnDark"] as const) {
    const file = form.get(kind);
    if (form.has(`remove.${kind}`)) {
      await db.brandAsset.deleteMany({ where: { propertyId: property.id, kind } });
      next[kind] = undefined;
    } else if (file instanceof File && file.size > 0) {
      if (!IMAGE.includes(file.type)) return fail("Logos must be PNG, SVG, WebP or JPG images.");
      if (file.size > 1_500_000) return fail("That logo is over 1.5 MB. Save a smaller copy and try again.");
      const data = { mime: file.type, data: Buffer.from(await file.arrayBuffer()) };
      await db.brandAsset.upsert({ where: { propertyId_kind: { propertyId: property.id, kind } }, update: data, create: { ...data, kind, propertyId: property.id } });
      next[kind] = `/api/brand/${property.slug}/${kind}?v=${Date.now()}`;
    }
  }
  await db.property.update({ where: { id: property.id }, data: { brand: JSON.parse(JSON.stringify(next)) } });
  redirect("/admin/brand?notice=" + encodeURIComponent("Brand saved. It now applies to the staff side and your booking pages."));
}
