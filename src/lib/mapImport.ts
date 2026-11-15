// Setting up a property starts with its map. This file reads a park map into a
// list of site types and sites ("the analysis"), and turns a reviewed analysis
// into real sites.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "./db";
import { BookingError } from "./reservations";

export const MapAnalysisSchema = z.object({
  siteTypes: z.array(
    z.object({
      key: z.string().describe("Short id used by sites[].type, e.g. 'comfort'"),
      name: z.string().describe("Name as written in the map key, without amp or hookup details"),
      color: z.string().describe("Hex colour this type is drawn in, e.g. #B85A22"),
      hookups: z.string().describe("'Full', 'Partial', 'Water & electric', 'None', or as the key states"),
      amps: z.number().describe("Highest amp service the key lists; 50 if not stated"),
      accessType: z.enum(["BACK_IN", "PULL_THROUGH"]),
    }),
  ),
  sites: z.array(
    z.object({
      name: z.string().describe("Site number or name exactly as printed"),
      type: z.string().describe("A siteTypes[].key"),
      x: z.number().describe("Centre of the site's printed label, percent of image width from the left (0-100)"),
      y: z.number().describe("Centre of the site's printed label, percent of image height from the top (0-100)"),
      accessible: z.boolean().describe("True if marked with a wheelchair / ADA symbol"),
    }),
  ),
  notes: z.array(z.string()).describe("Anything a person should check: skipped numbers, sites not in the key, unreadable labels"),
});
export type MapAnalysis = z.infer<typeof MapAnalysisSchema>;

export const mapReadingAvailable = Boolean(process.env.ANTHROPIC_API_KEY);

const PROMPT = `This is the site map of an RV park or campground. Build its site inventory.

1. Read the colour key (legend). Each entry is a site type. If a group of sites is drawn in a colour that is not in the key (for example rental units), make a type for it from its label on the map.
2. Find every numbered or named site. Work through the map area by area so none are missed, and read each number carefully: do not assume the numbering is continuous.
3. For each site give its type (from its colour), the position of the centre of its printed label, and whether it carries an accessibility symbol.
4. Back-in or pull-through: use what the key says. If the key is silent, a site that connects to a road at both ends is pull-through; otherwise back-in.
5. In notes, list anything a person should verify, such as numbers missing from a sequence, sites you could not read, and details the map does not show (site lengths are usually not shown).

Do not invent sites, lengths or prices. Report only what the map shows.`;

/** Read a map image with Claude. Needs ANTHROPIC_API_KEY. */
export async function readMap(image: Buffer, mime: string): Promise<MapAnalysis> {
  const client = new Anthropic();
  let res;
  try {
    res = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      output_config: { effort: "high", format: betaZodOutputFormat(MapAnalysisSchema) },
      // If the model declines for any reason, let the API retry on its default fallback.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: image.toString("base64") } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new BookingError("The map-reading key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new BookingError("The map reader is busy. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new BookingError(`The map could not be read (${e.status ?? "network error"}). Try again.`);
    throw e;
  }
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new BookingError("The map could not be read. Try a clearer image.");
  if (res.stop_reason === "max_tokens") throw new BookingError("This map has too many sites to read in one pass.");
  return res.parsed_output;
}

export type TypeSettings = {
  name: string;
  nightlyRate: number;
  monthlyRate: number;
  minRate: number;
  maxRate: number;
  lengthFt: number | null;
  bookable: boolean;
};

/**
 * Create or update the property's site types and sites from a reviewed analysis.
 * Sites already in the system are matched by name and keep their reservations.
 * Sites that are not on the map are removed, or switched off if they have reservations.
 */
export async function applyMapAnalysis(propertyId: string, analysis: MapAnalysis, settings: Record<string, TypeSettings>) {
  const names = new Set<string>();
  for (const s of analysis.sites) {
    if (names.has(s.name)) throw new BookingError(`Site ${s.name} appears twice on the map. Each site needs its own name.`);
    names.add(s.name);
    if (!analysis.siteTypes.some((t) => t.key === s.type)) throw new BookingError(`Site ${s.name} has an unknown type.`);
  }
  for (const t of analysis.siteTypes) {
    const st = settings[t.key];
    if (!st?.name) throw new BookingError("Every site type needs a name.");
    if (st.bookable && !(st.nightlyRate > 0 && st.monthlyRate > 0)) throw new BookingError(`Enter a nightly and monthly rate for ${st.name}, or untick Bookable.`);
    if (st.bookable && (st.minRate > st.nightlyRate || st.maxRate < st.nightlyRate)) throw new BookingError(`${st.name}: the nightly rate must sit between the floor and the ceiling.`);
  }

  return db.$transaction(async (tx) => {
    const classId: Record<string, string> = {};
    for (const [i, t] of analysis.siteTypes.entries()) {
      const st = settings[t.key];
      const data = { name: st.name, color: t.color, nightlyRate: st.nightlyRate, monthlyRate: st.monthlyRate, minRate: st.minRate, maxRate: st.maxRate, sortOrder: i };
      const existing = await tx.siteClass.findFirst({ where: { propertyId, name: st.name } });
      classId[t.key] = existing
        ? (await tx.siteClass.update({ where: { id: existing.id }, data })).id
        : (await tx.siteClass.create({ data: { ...data, propertyId, description: `${t.hookups} hookups, ${t.amps} amp.` } })).id;
    }
    for (const s of analysis.sites) {
      const t = analysis.siteTypes.find((x) => x.key === s.type)!;
      const st = settings[t.key];
      const data = { siteClassId: classId[s.type], mapX: s.x, mapY: s.y, accessible: s.accessible, accessType: t.accessType, amps: t.amps, hookups: t.hookups, active: st.bookable };
      await tx.site.upsert({
        where: { propertyId_name: { propertyId, name: s.name } },
        // An existing site keeps a length someone already entered.
        update: { ...data, ...(st.lengthFt ? { lengthFt: st.lengthFt } : {}) },
        create: { ...data, propertyId, name: s.name, lengthFt: st.lengthFt },
      });
    }
    const gone = await tx.site.findMany({ where: { propertyId, name: { notIn: [...names] } }, include: { _count: { select: { reservations: true } } } });
    for (const g of gone) {
      if (g._count.reservations) await tx.site.update({ where: { id: g.id }, data: { active: false, mapX: null, mapY: null } });
      else await tx.site.delete({ where: { id: g.id } });
    }
    await tx.siteClass.deleteMany({ where: { propertyId, sites: { none: {} } } });
    await tx.propertyMap.update({ where: { propertyId }, data: { appliedAt: new Date() } });
    return { sites: analysis.sites.length, types: analysis.siteTypes.length, removed: gone.length };
  });
}
