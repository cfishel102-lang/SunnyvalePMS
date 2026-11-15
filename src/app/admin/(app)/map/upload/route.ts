import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { mapReadingAvailable, readMap, type MapAnalysis } from "@/lib/mapImport";
import { BookingError } from "@/lib/reservations";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
export const maxDuration = 300;

/** Step 1 of setting up a property: upload the park map. It is read straight away if map reading is switched on. */
export async function POST(req: Request) {
  const { property } = await requireStaff();
  const to = (kind: "error" | "notice", m: string): never => redirect(`/admin/map?${kind}=${encodeURIComponent(m)}`);
  const file = (await req.formData()).get("map");
  if (!(file instanceof File) || file.size === 0) return to("error", "Choose an image of your park map.");
  if (!TYPES.includes(file.type)) return to("error", "Upload the map as a JPG, PNG or WebP image.");
  if (file.size > 4_500_000) return to("error", "That image is over 4.5 MB. Save a smaller copy and try again.");
  const data = Buffer.from(await file.arrayBuffer());

  // Save the image first so it is kept even if reading it fails.
  const fields = { mime: file.type, data, analysis: Prisma.DbNull, appliedAt: null };
  await db.propertyMap.upsert({ where: { propertyId: property.id }, update: fields, create: { ...fields, propertyId: property.id } });
  if (!mapReadingAvailable) return to("notice", "Map uploaded.");

  let analysis: MapAnalysis;
  try {
    analysis = await readMap(data, file.type);
  } catch (e) {
    if (e instanceof BookingError) return to("error", e.message);
    throw e;
  }
  await db.propertyMap.update({ where: { propertyId: property.id }, data: { analysis } });
  return to("notice", `Found ${analysis.sites.length} sites in ${analysis.siteTypes.length} types. Review them below.`);
}
