// Sets up RV at Olympic from its park map (prisma/maps), with PLACEHOLDER rates and sample reservations
// so every screen has something to show. Run `npm run seed` to reset to this state.
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "../src/lib/db";
import { addDays, nightsBetween, toDate, today } from "../src/lib/dates";
import { readFileSync } from "fs";
import { applyMapAnalysis, MapAnalysisSchema } from "../src/lib/mapImport";
import { quoteStay } from "../src/lib/pricing";

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

const FIRST = ["Dana", "Marcus", "Priya", "Tom", "Elena", "Russ", "Hannah", "Luis", "Carol", "Ben", "Yuki", "Grace", "Omar", "Sally", "Pete", "Nora", "Wes", "Irene", "Joel", "Tess"];
const LAST = ["Whitfield", "Okafor", "Lindgren", "Barrett", "Nakamura", "Castillo", "Hobbs", "Ferrante", "Dunn", "Avery", "Kowalski", "Pruitt", "Sandoval", "Mercer", "Yates", "Holloway", "Brandt", "Ibarra"];
const RIGS = ["Class A", "Class C", "Fifth wheel", "Travel trailer", "Camper van"];
const SOURCES = [..."WWWWWWWWWW".split("").map(() => "WEBSITE"), ...Array(5).fill("STAFF"), "EXPEDIA", "EXPEDIA", "BOOKING_COM", "BOOKING_COM", "AIRBNB", "API"] as const;

async function main() {
  for (const t of ["BrandAsset", "Payment", "Reservation", "Guest", "Channel", "PricingRule", "Season", "Site", "SiteClass", "PropertyMap", "Property", "ApiKey", "User", "Organization"]) {
    await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
  }

  const org = await db.organization.create({ data: { name: "My Campgrounds", slug: "my-campgrounds" } });
  await db.user.create({
    // Set ADMIN_EMAIL and ADMIN_PASSWORD before the first deploy; the fallback is for local testing only.
    data: { organizationId: org.id, email: (process.env.ADMIN_EMAIL || "owner@example.com").toLowerCase(), name: "Owner", passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || "campground", 10) },
  });

  const now = today();
  const year = Number(now.slice(0, 4));
  const property = await db.property.create({
    data: {
      organizationId: org.id,
      name: "RV at Olympic",
      slug: "rv-at-olympic",
      tagline: "Full-hookup RV sites for a night, a week, or the season.",
      taxRatePct: 8.5,
      // From the RV@Olympic brand guidelines.
      brand: {
        colors: { primary: "#636F56", accent: "#A36334", tint: "#C0C5AA", highlight: "#E3D370" },
        fonts: { heading: "Oswald", label: "Montserrat", body: "Nunito Sans" },
        logo: "/brand/rv-at-olympic-logo-olive.png",
        logoOnDark: "/brand/rv-at-olympic-logo-sage.png",
      },
      weeklyDiscountPct: 10,
      weekendUpliftPct: 10,
      seasons: {
        create: [year - 1, year, year + 1].flatMap((y) => [
          { name: "Off-season", startDate: toDate(`${y}-11-01`), endDate: toDate(`${y + 1}-03-31`), adjustPct: -15 },
          { name: "Shoulder", startDate: toDate(`${y}-05-01`), endDate: toDate(`${y}-06-14`), adjustPct: 5 },
          { name: "Peak", startDate: toDate(`${y}-06-15`), endDate: toDate(`${y}-09-15`), adjustPct: 20 },
        ]),
      },
      pricingRules: { create: [{ occupancyPct: 60, adjustPct: 10 }, { occupancyPct: 75, adjustPct: 20 }, { occupancyPct: 90, adjustPct: 35 }] },
      channels: {
        create: (["EXPEDIA", "BOOKING_COM", "AIRBNB"] as const).map((source) => ({ source, exportToken: randomBytes(16).toString("hex") })),
      },
    },
    include: { seasons: true, pricingRules: true },
  });

  // The real site list, read from the park map. Rates below are placeholders.
  const analysis = MapAnalysisSchema.parse(JSON.parse(readFileSync("prisma/maps/rv-at-olympic.json", "utf8")));
  await db.propertyMap.create({ data: { propertyId: property.id, mime: "image/jpeg", data: readFileSync("prisma/maps/rv-at-olympic.jpg"), analysis } });
  const rate = (nightlyRate: number, monthlyRate: number, minRate: number, maxRate: number, bookable = true) => ({ nightlyRate, monthlyRate, minRate, maxRate, bookable, lengthFt: null });
  await applyMapAnalysis(property.id, analysis, {
    partial: { name: "Partial Hook Up", ...rate(49, 850, 39, 79) },
    standard: { name: "Standard Back-In", ...rate(59, 950, 45, 95) },
    plus: { name: "Standard + Back-In", ...rate(65, 1000, 49, 105) },
    comfort: { name: "Comfort Back-In", ...rate(72, 1100, 55, 119) },
    rental: { name: "Private RV Rentals", ...rate(0, 0, 0, 0, false) },
  });
  const sites = (await db.site.findMany({ where: { propertyId: property.id, active: true }, include: { siteClass: true } }))
    .sort((a, b) => Number(a.name) - Number(b.name))
    .map((x) => ({ id: x.id, cls: x.siteClass, allowLongTerm: true }));

  // Sample guests and reservations: busy transient summer, long-term stays in the off-season.
  const guests = [];
  for (let i = 0; i < 300; i++) {
    const firstName = pick(FIRST), lastName = pick(LAST);
    guests.push(await db.guest.create({
      data: { organizationId: org.id, firstName, lastName, email: `${firstName}.${lastName}${i}@example.com`.toLowerCase(), phone: `(555) 01${int(10, 99)}-${int(1000, 9999)}` },
    }));
  }
  const ctx = { property, totalSites: sites.length, occupied: new Map<string, number>() };
  const start = addDays(now, -150), end = addDays(now, 120);
  const resv = [], pays = [];
  let n = 0;
  for (const [si, site] of sites.entries()) {
    let d = addDays(start, int(0, 4));
    while (d < end) {
      const month = Number(d.slice(5, 7));
      const offSeason = month >= 10 || month <= 3;
      const peak = month >= 6 && month <= 9;
      const longTerm = offSeason && site.allowLongTerm && si % 5 < 2;
      const len = longTerm ? pick([30, 30, 60, 90]) : pick([1, 2, 2, 3, 3, 4, 5, 7]);
      const out = addDays(d, len);
      const future = nightsBetween(now, d);
      // Further-out dates are less booked, as in real life.
      const skip = future > 0 && !longTerm && rnd() < Math.min(0.9, future / 60);
      if (!skip) {
        const q = quoteStay(ctx, site.cls, d, out);
        const cancelled = rnd() < 0.04;
        const status = cancelled ? "CANCELLED" : out <= now ? "CHECKED_OUT" : d <= now ? "CHECKED_IN" : "CONFIRMED";
        const id = `seed${n++}`;
        const created = new Date(toDate(d).getTime() - int(1, longTerm ? 60 : 30) * 86_400_000);
        resv.push({
          id, code: `S${String(1000 + n)}X`, propertyId: property.id, siteId: site.id, guestId: pick(guests).id,
          checkIn: toDate(d), checkOut: toDate(out), nights: len, stayType: q.stayType, status,
          source: longTerm ? "STAFF" : pick([...SOURCES]), adults: int(1, 2), children: int(0, 2),
          rigType: pick(RIGS), rigLengthFt: int(22, 40), subtotal: q.subtotal, tax: q.tax, total: q.total,
          createdAt: created, cancelledAt: cancelled ? created : null,
        } as const);
        if (!cancelled) pays.push({ reservationId: id, amount: q.total, method: "Card", createdAt: created, note: "Sample data" });
      }
      d = addDays(out, longTerm ? int(0, 3) : peak ? int(0, 2) : int(1, 9));
    }
  }
  await db.reservation.createMany({ data: resv });
  await db.payment.createMany({ data: pays });
  console.log(`Seeded ${sites.length} sites, ${guests.length} guests, ${resv.length} reservations.`);
}

main().finally(() => db.$disconnect());
