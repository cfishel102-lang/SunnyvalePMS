import { Prisma, type PricingRule, type Property, type Season, type SiteClass } from "@prisma/client";
import { db } from "./db";
import { eachNight, nightsBetween, toDate, toStr } from "./dates";
import { round2 } from "./format";

export type PricingContext = {
  property: Property & { seasons: Season[]; pricingRules: PricingRule[] };
  totalSites: number;
  /** night -> number of sites already occupied */
  occupied: Map<string, number>;
};

export type NightPrice = { date: string; base: number; rate: number; occupancy: number; notes: string[] };
export type Quote = {
  nights: NightPrice[];
  stayType: "TRANSIENT" | "LONG_TERM";
  avgNightly: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
};

/** How many sites are occupied on each night in [from, to). */
export async function occupiedByNight(propertyId: string, from: string, to: string, excludeReservationId?: string) {
  const rows = await db.$queryRaw<{ night: Date; n: bigint }[]>(Prisma.sql`
    SELECT d::date AS night, count(r.id) AS n
    FROM generate_series(${from}::date, ${to}::date - 1, interval '1 day') d
    LEFT JOIN "Reservation" r
      ON r."propertyId" = ${propertyId} AND r.status <> 'CANCELLED'
     AND r."checkIn" <= d AND r."checkOut" > d
     AND r.id <> ${excludeReservationId ?? ""}
    GROUP BY 1`);
  return new Map(rows.map((r) => [toStr(r.night), Number(r.n)]));
}

export async function loadPricingContext(propertyId: string, from: string, to: string, excludeReservationId?: string): Promise<PricingContext> {
  const [property, totalSites, occupied] = await Promise.all([
    db.property.findUniqueOrThrow({ where: { id: propertyId }, include: { seasons: true, pricingRules: true } }),
    db.site.count({ where: { propertyId, active: true } }),
    occupiedByNight(propertyId, from, to, excludeReservationId),
  ]);
  return { property, totalSites, occupied };
}

/**
 * Price a stay in one site class.
 *
 * Long-term stays (at or above the property's minimum) pay the monthly rate, pro-rated per night.
 * Shorter stays pay the nightly rate, adjusted by season, weekend, and how full the
 * park already is that night, and always kept between the class's floor and ceiling.
 */
export function quoteStay(ctx: PricingContext, cls: SiteClass, checkIn: string, checkOut: string): Quote {
  const p = ctx.property;
  const dates = eachNight(checkIn, checkOut);
  const n = dates.length;
  const longTerm = n >= p.longTermMinNights;
  const nightly = Number(cls.nightlyRate);
  const min = Number(cls.minRate);
  const max = Number(cls.maxRate);
  const rules = [...p.pricingRules].sort((a, b) => b.occupancyPct - a.occupancyPct);

  const nights: NightPrice[] = dates.map((date) => {
    const occupancy = ctx.totalSites ? (ctx.occupied.get(date) ?? 0) / ctx.totalSites : 0;
    if (longTerm) {
      return { date, base: nightly, rate: Number(cls.monthlyRate) / 30, occupancy, notes: ["Monthly rate"] };
    }
    const notes: string[] = [];
    let rate = nightly;
    const d = toDate(date);
    const season = p.seasons.find((s) => s.startDate <= d && d <= s.endDate);
    if (season && Number(season.adjustPct) !== 0) {
      rate *= 1 + Number(season.adjustPct) / 100;
      notes.push(`${season.name} ${signed(Number(season.adjustPct))}`);
    }
    const dow = d.getUTCDay();
    if ((dow === 5 || dow === 6) && Number(p.weekendUpliftPct) !== 0) {
      rate *= 1 + Number(p.weekendUpliftPct) / 100;
      notes.push(`Weekend ${signed(Number(p.weekendUpliftPct))}`);
    }
    if (p.dynamicPricing) {
      const rule = rules.find((r) => occupancy * 100 >= r.occupancyPct);
      if (rule) {
        rate *= 1 + Number(rule.adjustPct) / 100;
        notes.push(`${rule.occupancyPct}%+ full ${signed(Number(rule.adjustPct))}`);
      }
    }
    if (rate < min) { rate = min; notes.push("Held at floor"); }
    if (rate > max) { rate = max; notes.push("Capped at ceiling"); }
    return { date, base: nightly, rate: Math.round(rate), occupancy, notes };
  });

  const gross = nights.reduce((s, x) => s + x.rate, 0);
  const discount = !longTerm && n >= 7 ? round2((gross * Number(p.weeklyDiscountPct)) / 100) : 0;
  const subtotal = round2(gross - discount);
  const taxable = longTerm ? p.taxLongTerm : true;
  const tax = taxable ? round2((subtotal * Number(p.taxRatePct)) / 100) : 0;
  return {
    nights,
    stayType: longTerm ? "LONG_TERM" : "TRANSIENT",
    avgNightly: n ? round2(subtotal / n) : 0,
    discount,
    subtotal,
    tax,
    total: round2(subtotal + tax),
  };
}

function signed(n: number) {
  return (n > 0 ? "+" : "") + n + "%";
}

/** Release unpaid online holds that have timed out, so the sites go back on sale. */
export async function releaseExpiredHolds() {
  await db.reservation.updateMany({
    where: { holdExpiresAt: { lt: new Date() }, status: "CONFIRMED", payments: { none: {} } },
    data: { status: "CANCELLED", cancelledAt: new Date(), holdExpiresAt: null, notes: "Released: online payment was not completed." },
  });
}

export type AvailabilityFilter = { rigLengthFt?: number | null; accessType?: "BACK_IN" | "PULL_THROUGH" | null; excludeReservationId?: string };

/** Sites that are free for the whole stay and fit the rig and stay length. */
export async function availableSites(propertyId: string, checkIn: string, checkOut: string, f: AvailabilityFilter = {}) {
  await releaseExpiredHolds();
  const property = await db.property.findUniqueOrThrow({ where: { id: propertyId } });
  const longTerm = nightsBetween(checkIn, checkOut) >= property.longTermMinNights;
  const sites = await db.site.findMany({
    where: {
      propertyId,
      active: true,
      ...(longTerm ? { allowLongTerm: true } : { allowShortTerm: true }),
      // A site with no length entered yet is not filtered out.
      ...(f.rigLengthFt ? { OR: [{ lengthFt: { gte: f.rigLengthFt } }, { lengthFt: null }] } : {}),
      ...(f.accessType ? { accessType: f.accessType } : {}),
      reservations: {
        none: {
          status: { not: "CANCELLED" },
          checkIn: { lt: toDate(checkOut) },
          checkOut: { gt: toDate(checkIn) },
          ...(f.excludeReservationId ? { id: { not: f.excludeReservationId } } : {}),
        },
      },
    },
    include: { siteClass: true },
  });
  return sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Availability grouped by site class with a price for each: what the booking page shows. */
export async function searchAvailability(propertyId: string, checkIn: string, checkOut: string, f: AvailabilityFilter = {}) {
  const [sites, ctx, classes] = await Promise.all([
    availableSites(propertyId, checkIn, checkOut, f),
    loadPricingContext(propertyId, checkIn, checkOut, f.excludeReservationId),
    db.siteClass.findMany({ where: { propertyId }, orderBy: { sortOrder: "asc" } }),
  ]);
  return classes
    .map((cls) => ({
      siteClass: cls,
      sites: sites.filter((s) => s.siteClassId === cls.id),
      quote: quoteStay(ctx, cls, checkIn, checkOut),
    }))
    .filter((c) => c.sites.length > 0);
}
