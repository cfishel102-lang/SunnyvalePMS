import { Prisma } from "@prisma/client";
import { db } from "./db";
import { nightsBetween } from "./dates";
import { SOURCE_LABEL } from "./format";

// Every report is the same question asked different ways: "for the nights in
// this date range, how many site-nights were sold and for how much, grouped by X?"
// Revenue is spread evenly across the nights of each stay.

export const DIMENSIONS = {
  day: { label: "Day", time: true, sql: `to_char(night, 'YYYY-MM-DD')` },
  week: { label: "Week", time: true, sql: `to_char(date_trunc('week', night), 'YYYY-MM-DD')` },
  month: { label: "Month", time: true, sql: `to_char(night, 'YYYY-MM')` },
  weekday: { label: "Day of week", time: true, sql: `to_char(night, 'ID Dy')` },
  stayType: { label: "Stay type", time: false, sql: `r."stayType"::text` },
  source: { label: "Booking source", time: false, sql: `r.source::text` },
  siteClass: { label: "Site type", time: false, sql: `c.name` },
  access: { label: "Back-in vs pull-through", time: false, sql: `s."accessType"::text` },
  site: { label: "Site", time: false, sql: `s.name` },
} as const;
export type Dimension = keyof typeof DIMENSIONS;

export type ReportRow = {
  key: string;
  label: string;
  nights: number;
  available: number;
  reservations: number;
  revenue: number;
  adr: number;
  occupancy: number;
  revpar: number;
};

const LABELS: Record<string, string> = { ...SOURCE_LABEL, TRANSIENT: "Transient", LONG_TERM: "Long-term", BACK_IN: "Back-in", PULL_THROUGH: "Pull-through" };

function finish(key: string, dim: Dimension, nights: number, reservations: number, revenue: number, available: number): ReportRow {
  let label = LABELS[key] ?? key;
  if (dim === "weekday") label = key.slice(2);
  if (dim === "month") label = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(key + "-01T00:00:00Z"));
  if (dim === "day" || dim === "week") label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(key + "T00:00:00Z"));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    key, label, nights, reservations, revenue: r2(revenue), available,
    adr: nights ? r2(revenue / nights) : 0,
    occupancy: available ? Math.round((nights / available) * 10000) / 10000 : 0,
    revpar: available ? r2(revenue / available) : 0,
  };
}

/** Run a report over nights in [from, to), grouped by one dimension. */
export async function runReport(propertyId: string, from: string, to: string, dim: Dimension) {
  const d = DIMENSIONS[dim];
  const expr = Prisma.raw(d.sql);
  const sites = await db.site.count({ where: { propertyId, active: true } });
  const days = Math.max(0, nightsBetween(from, to));

  const sold = await db.$queryRaw<{ key: string; nights: bigint; reservations: bigint; revenue: number }[]>(Prisma.sql`
    SELECT ${expr} AS key, count(*) AS nights, count(DISTINCT r.id) AS reservations,
           coalesce(sum(r.subtotal / r.nights), 0)::float AS revenue
    FROM generate_series(${from}::date, ${to}::date - 1, interval '1 day') night
    JOIN "Reservation" r ON r."propertyId" = ${propertyId} AND r.status <> 'CANCELLED'
      AND r."checkIn" <= night AND r."checkOut" > night
    JOIN "Site" s ON s.id = r."siteId"
    JOIN "SiteClass" c ON c.id = s."siteClassId"
    GROUP BY 1 ORDER BY 1`);

  let rows: ReportRow[];
  if (d.time) {
    // Include empty periods too, and measure occupancy against the sites available in each.
    const buckets = await db.$queryRaw<{ key: string; days: bigint }[]>(Prisma.sql`
      SELECT ${expr} AS key, count(*) AS days
      FROM generate_series(${from}::date, ${to}::date - 1, interval '1 day') night GROUP BY 1 ORDER BY 1`);
    const byKey = new Map(sold.map((s) => [s.key, s]));
    rows = buckets.map((b) => {
      const s = byKey.get(b.key);
      return finish(b.key, dim, Number(s?.nights ?? 0), Number(s?.reservations ?? 0), s?.revenue ?? 0, Number(b.days) * sites);
    });
  } else {
    rows = sold.map((s) => finish(s.key, dim, Number(s.nights), Number(s.reservations), s.revenue, days * sites));
    if (dim !== "site") rows.sort((a, b) => b.revenue - a.revenue);
  }

  const nights = sold.reduce((n, s) => n + Number(s.nights), 0);
  const revenue = sold.reduce((n, s) => n + s.revenue, 0);
  const resv = await db.reservation.count({
    where: { propertyId, status: { not: "CANCELLED" }, checkIn: { lt: new Date(to + "T00:00:00Z") }, checkOut: { gt: new Date(from + "T00:00:00Z") } },
  });
  return { rows, total: finish("Total", "site", nights, resv, revenue, days * sites) };
}

export function toCsv(rows: ReportRow[], dimLabel: string) {
  const head = [dimLabel, "Nights sold", "Nights available", "Occupancy %", "Reservations", "Revenue", "ADR", "RevPAR"];
  const body = rows.map((r) => [
    `"${r.label.replace(/"/g, '""')}"`, r.nights, r.available, (r.occupancy * 100).toFixed(1), r.reservations,
    r.revenue.toFixed(2), r.adr.toFixed(2), r.revpar.toFixed(2),
  ]);
  return [head, ...body].map((r) => r.join(",")).join("\n");
}
