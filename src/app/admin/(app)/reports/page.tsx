import Link from "next/link";
import { Bars, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { addDays, fmtDate, isDateStr, startOfMonth, today } from "@/lib/dates";
import { money, pct } from "@/lib/format";
import { DIMENSIONS, runReport, type Dimension, type ReportRow } from "@/lib/reports";

const METRICS = {
  revenue: { label: "Revenue", get: (r: ReportRow) => r.revenue, fmt: (n: number) => money(n, false) },
  occupancy: { label: "Occupancy", get: (r: ReportRow) => r.occupancy, fmt: (n: number) => pct(n, 1) },
  adr: { label: "Average nightly rate", get: (r: ReportRow) => r.adr, fmt: (n: number) => money(n) },
  revpar: { label: "RevPAR", get: (r: ReportRow) => r.revpar, fmt: (n: number) => money(n) },
  nights: { label: "Nights sold", get: (r: ReportRow) => r.nights, fmt: (n: number) => String(n) },
} as const;

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const sp = await searchParams;
  const now = today(property.timezone);
  const from = isDateStr(sp.from) ? sp.from : addDays(now, -90);
  const to = isDateStr(sp.to) && sp.to > from ? sp.to : now;
  const dim = (sp.by && sp.by in DIMENSIONS ? sp.by : "month") as Dimension;
  const metric = (sp.metric && sp.metric in METRICS ? sp.metric : "revenue") as keyof typeof METRICS;
  const m = METRICS[metric];
  const { rows, total } = await runReport(property.id, from, to, dim);
  const qs = new URLSearchParams({ from, to, by: dim, metric }).toString();

  const y = now.slice(0, 4);
  const presets: [string, string, string, string][] = [
    ["Last 30 days", addDays(now, -30), now, "day"],
    ["This month", startOfMonth(now), addDays(now, 1), "day"],
    ["Last 90 days", addDays(now, -90), now, "week"],
    ["Year to date", `${y}-01-01`, addDays(now, 1), "month"],
    ["Next 60 days (on the books)", now, addDays(now, 60), "week"],
    ["Transient vs long-term", addDays(now, -90), now, "stayType"],
    ["By booking source", addDays(now, -90), now, "source"],
    ["Back-in vs pull-through", addDays(now, -90), now, "access"],
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="h1">Reports</h1>
      <p className="mb-4 text-sm text-muted">Pick a date range, what to group by, and what to chart. Every report can be downloaded for Excel.</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {presets.map(([label, a, b, by]) => (
          <Link key={label} href={`/admin/reports?from=${a}&to=${b}&by=${by}&metric=${metric}`} className="btn btn-sm">{label}</Link>
        ))}
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div><label className="label" htmlFor="from">Stay nights from</label><input className="input" type="date" id="from" name="from" defaultValue={from} /></div>
        <div><label className="label" htmlFor="to">To (not included)</label><input className="input" type="date" id="to" name="to" defaultValue={to} /></div>
        <div><label className="label" htmlFor="by">Group by</label>
          <select className="input" id="by" name="by" defaultValue={dim}>{Object.entries(DIMENSIONS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}</select>
        </div>
        <div><label className="label" htmlFor="metric">Chart</label>
          <select className="input" id="metric" name="metric" defaultValue={metric}>{Object.entries(METRICS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select>
        </div>
        <button className="btn btn-primary">Run report</button>
        <a className="btn ml-auto" href={`/admin/reports/export?${qs}`}>Download CSV</a>
      </form>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Revenue" value={money(total.revenue, false)} sub="Site revenue before tax" />
        <Stat label="Occupancy" value={pct(total.occupancy, 1)} sub={`${total.nights.toLocaleString()} of ${total.available.toLocaleString()} site-nights`} />
        <Stat label="Average nightly rate" value={money(total.adr)} />
        <Stat label="RevPAR" value={money(total.revpar)} sub="Revenue per available site-night" />
        <Stat label="Reservations" value={total.reservations.toLocaleString()} />
      </div>

      {rows.length > 0 && rows.length <= 120 && (
        <div className="card mt-4 p-4">
          <h2 className="h2 mb-4">{m.label} by {DIMENSIONS[dim].label.toLowerCase()}</h2>
          <Bars format={m.fmt} max={metric === "occupancy" && DIMENSIONS[dim].time ? 1 : undefined} data={rows.map((r) => ({ label: r.label, value: m.get(r) }))} />
        </div>
      )}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th">{DIMENSIONS[dim].label}</th><th className="th num">Nights sold</th><th className="th num">{DIMENSIONS[dim].time ? "Occupancy" : "Share of capacity"}</th>
            <th className="th num">Reservations</th><th className="th num">Revenue</th><th className="th num">ADR</th><th className="th num">RevPAR</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="td">{r.label}</td><td className="td num">{r.nights.toLocaleString()}</td><td className="td num">{pct(r.occupancy, 1)}</td>
                <td className="td num">{r.reservations.toLocaleString()}</td><td className="td num">{money(r.revenue)}</td><td className="td num">{money(r.adr)}</td><td className="td num">{money(r.revpar)}</td>
              </tr>
            ))}
            <tr className="bg-paper font-semibold">
              <td className="td">Total</td><td className="td num">{total.nights.toLocaleString()}</td><td className="td num">{pct(total.occupancy, 1)}</td>
              <td className="td num">{total.reservations.toLocaleString()}</td><td className="td num">{money(total.revenue)}</td><td className="td num">{money(total.adr)}</td><td className="td num">{money(total.revpar)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Showing {fmtDate(from)} to {fmtDate(addDays(to, -1))}. Revenue is counted on the night of the stay, not the day it was booked. Cancelled reservations are left out.</p>
    </div>
  );
}
