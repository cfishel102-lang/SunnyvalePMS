// Sets up RV at Olympic with PLACEHOLDER sites, rates and sample reservations
// so every screen has something to show. Run `npm run seed` to reset to this state.
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "../src/lib/db";
import { addDays, nightsBetween, toDate, today } from "../src/lib/dates";
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
  for (const t of ["Payment", "Reservation", "Guest", "Channel", "PricingRule", "Season", "Site", "SiteClass", "Property", "ApiKey", "User", "Organization"]) {
    await db.$executeRawUnsafe(`DELETE FROM "${t}"`);
  }

  const org = await db.organization.create({ data: { name: "My Campgrounds", slug: "my-campgrounds" } });
  await db.user.create({
    data: { organizationId: org.id, email: "owner@example.com", name: "Owner", passwordHash: await bcrypt.hash("campground", 10) },
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

  const classes = [
    { name: "Premium Pull-Through", description: "Our longest sites. Full hookups, 50 amp, easy in and out for big rigs.", nightlyRate: 79, monthlyRate: 1150, minRate: 59, maxRate: 129, count: 8, len: [65, 75], access: "PULL_THROUGH", amps: 50, hookups: "Full", longFrom: 5 },
    { name: "Standard Pull-Through", description: "Full hookups and 50 amp service with pull-through access.", nightlyRate: 69, monthlyRate: 1050, minRate: 49, maxRate: 109, count: 12, len: [50, 60], access: "PULL_THROUGH", amps: 50, hookups: "Full", longFrom: 1 },
    { name: "Back-In Full Hookup", description: "Full hookups on a quieter back-in site.", nightlyRate: 59, monthlyRate: 950, minRate: 45, maxRate: 95, count: 14, len: [35, 45], access: "BACK_IN", amps: 50, hookups: "Full", longFrom: 1 },
    { name: "Back-In Water & Electric", description: "Water and 30 amp electric. Great value for smaller rigs.", nightlyRate: 49, monthlyRate: 850, minRate: 39, maxRate: 79, count: 8, len: [28, 35], access: "BACK_IN", amps: 30, hookups: "Water & electric", longFrom: 1 },
  ] as const;

  let num = 1;
  const sites: { id: string; cls: Awaited<ReturnType<typeof db.siteClass.create>>; allowLongTerm: boolean }[] = [];
  for (const [i, c] of classes.entries()) {
    const cls = await db.siteClass.create({
      data: { propertyId: property.id, name: c.name, description: c.description, nightlyRate: c.nightlyRate, monthlyRate: c.monthlyRate, minRate: c.minRate, maxRate: c.maxRate, sortOrder: i },
    });
    for (let k = 1; k <= c.count; k++) {
      const allowLongTerm = k >= c.longFrom;
      const s = await db.site.create({
        data: {
          propertyId: property.id, siteClassId: cls.id, name: String(num++),
          lengthFt: Math.round((c.len[0] + ((c.len[1] - c.len[0]) * (k - 1)) / (c.count - 1)) / 5) * 5,
          accessType: c.access, amps: c.amps, hookups: c.hookups, allowLongTerm,
        },
      });
      sites.push({ id: s.id, cls, allowLongTerm });
    }
  }

  // Sample guests and reservations: busy transient summer, long-term stays in the off-season.
  const guests = [];
  for (let i = 0; i < 160; i++) {
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
      const longTerm = offSeason && site.allowLongTerm && si % 5 < 3;
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
