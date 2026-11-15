import Link from "next/link";
import { Bars, Stat, StatusBadge, Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, startOfMonth, toDate, today } from "@/lib/dates";
import { money, pct } from "@/lib/format";
import { runReport } from "@/lib/reports";
import { setStatusAction } from "../actions";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const now = today(property.timezone);
  const d = toDate(now);
  const include = { guest: true, site: true } as const;
  const [tonight, mtd, forward, sources, arrivals, departures, sites] = await Promise.all([
    runReport(property.id, now, addDays(now, 1), "stayType"),
    runReport(property.id, startOfMonth(now), addDays(now, 1), "stayType"),
    runReport(property.id, now, addDays(now, 30), "day"),
    runReport(property.id, addDays(now, -30), now, "source"),
    db.reservation.findMany({ where: { propertyId: property.id, checkIn: d, status: { in: ["CONFIRMED", "CHECKED_IN"] } }, include, orderBy: { site: { name: "asc" } } }),
    db.reservation.findMany({ where: { propertyId: property.id, checkOut: d, status: { in: ["CHECKED_IN", "CHECKED_OUT"] } }, include, orderBy: { site: { name: "asc" } } }),
    db.site.count({ where: { propertyId: property.id, active: true } }),
  ]);
  const longTerm = tonight.rows.find((r) => r.key === "LONG_TERM")?.nights ?? 0;
  const srcTotal = sources.rows.reduce((s, r) => s + r.revenue, 0) || 1;

  const list = (title: string, rows: typeof arrivals, next: "CHECKED_IN" | "CHECKED_OUT", verb: string) => (
    <div className="card">
      <h2 className="h2 px-4 pt-4">{title} <span className="font-normal text-muted">({rows.length})</span></h2>
      {rows.length === 0 && <p className="px-4 pt-2 pb-4 text-sm text-muted">None today.</p>}
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-sm">
            <span className="w-10 font-semibold tabular-nums">{r.site.name}</span>
            <Link href={`/admin/reservations/${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.guest.firstName} {r.guest.lastName}</Link>
            <span className="hidden text-xs text-muted sm:inline">{r.nights} nights</span>
            {r.status === next ? <StatusBadge status={r.status} /> : (
              <form action={setStatusAction}>
                <input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={next} /><input type="hidden" name="back" value="/admin" />
                <button className="btn btn-sm">{verb}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="h1">Today</h1>
          <p className="text-sm text-muted">{fmtDate(now, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <Link href="/admin/reservations/new" className="btn btn-primary md:hidden">+ New</Link>
      </div>
      <Flash sp={await searchParams} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Occupied tonight" value={pct(tonight.total.occupancy)} sub={`${tonight.total.nights} of ${sites} sites · ${longTerm} long-term`} />
        <Stat label="Revenue this month" value={money(mtd.total.revenue, false)} sub="Site revenue before tax" />
        <Stat label="Average nightly rate (ADR)" value={money(mtd.total.adr)} sub="This month to date" />
        <Stat label="Revenue per available site" value={money(mtd.total.revpar)} sub="RevPAR, this month to date" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {list("Arriving today", arrivals, "CHECKED_IN", "Check in")}
        {list("Departing today", departures, "CHECKED_OUT", "Check out")}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card p-4">
          <h2 className="h2">Occupancy, next 30 nights</h2>
          <p className="mb-4 text-xs text-muted">Amber nights are 75% full or more, where dynamic pricing is lifting rates.</p>
          <Bars max={1} format={(n) => pct(n)} data={forward.rows.map((r) => ({ label: r.label, value: r.occupancy, tone: r.occupancy >= 0.75 ? "bg-amber" : "bg-pine" }))} />
        </div>
        <div className="card p-4">
          <h2 className="h2">Where bookings came from</h2>
          <p className="mb-3 text-xs text-muted">Share of site revenue, last 30 days</p>
          <ul className="space-y-2.5">
            {sources.rows.map((r) => (
              <li key={r.key} className="text-sm">
                <div className="flex justify-between"><span>{r.label}</span><span className="tabular-nums text-muted">{pct(r.revenue / srcTotal)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-paper"><div className="h-full rounded-full bg-pine" style={{ width: `${(r.revenue / srcTotal) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
