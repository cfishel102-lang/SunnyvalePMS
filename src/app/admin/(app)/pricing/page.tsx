import { Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, toDate, today, toStr } from "@/lib/dates";
import { money, pct } from "@/lib/format";
import { loadPricingContext, quoteStay } from "@/lib/pricing";
import { addRuleAction, addSeasonAction, deleteRuleAction, deleteSeasonAction, saveClassAction, savePricingAction } from "../../actions";

export default async function Pricing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const now = today(property.timezone);
  const [classes, ctx] = await Promise.all([
    db.siteClass.findMany({ where: { propertyId: property.id }, orderBy: { sortOrder: "asc" } }),
    loadPricingContext(property.id, now, addDays(now, 14)),
  ]);
  const p = ctx.property;
  const rules = [...p.pricingRules].sort((a, b) => a.occupancyPct - b.occupancyPct);
  const seasons = p.seasons.filter((s) => s.endDate >= toDate(now)).sort((a, b) => +a.startDate - +b.startDate);
  const preview = classes.map((c) => ({ c, nights: Array.from({ length: 14 }, (_, i) => quoteStay(ctx, c, addDays(now, i), addDays(now, i + 1)).nights[0]) }));

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="h1">Pricing</h1>
        <p className="text-sm text-muted">Set your base rates and limits. The system adjusts nightly prices inside those limits as the park fills.</p>
      </div>
      <Flash sp={await searchParams} />

      <div className="card overflow-x-auto p-5">
        <h2 className="h2">Rates and limits by site type</h2>
        <p className="mb-3 text-xs text-muted">Dynamic pricing never goes below the floor or above the ceiling. Long-term stays pay the monthly rate, pro-rated by night.</p>
        <table className="w-full">
          <thead><tr><th className="th">Site type</th><th className="th">Nightly ($)</th><th className="th">Floor ($)</th><th className="th">Ceiling ($)</th><th className="th">Monthly ($)</th><th className="th" /></tr></thead>
          <tbody>
            {[...classes, null].map((c) => {
              const f = `class-${c?.id ?? "new"}`;
              const num = (name: "nightlyRate" | "minRate" | "maxRate" | "monthlyRate") => (
                <td className="td"><input form={f} name={name} type="number" step="1" min={0} defaultValue={c ? Number(c[name]) : ""} className="input input-sm w-24" aria-label={name} /></td>
              );
              return (
                <tr key={f}>
                  <td className="td">
                    <form id={f} action={saveClassAction}>{c && <input type="hidden" name="id" value={c.id} />}<input type="hidden" name="description" value={c?.description ?? ""} /></form>
                    <input form={f} name="name" defaultValue={c?.name} placeholder="New site type" className="input input-sm w-56" aria-label="Name" />
                  </td>
                  {num("nightlyRate")}{num("minRate")}{num("maxRate")}{num("monthlyRate")}
                  <td className="td"><button form={f} className="btn btn-sm">{c ? "Save" : "Add"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="h2">Occupancy rules</h2>
          <p className="mb-3 text-xs text-muted">When the whole park is at least this full on a night, that night's transient rate changes by this much. The highest matching rule applies.</p>
          <ul className="text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-line py-2">
                <span>At <b>{r.occupancyPct}%</b> full or more: <b>{Number(r.adjustPct) > 0 ? "+" : ""}{Number(r.adjustPct)}%</b></span>
                <form action={deleteRuleAction}><input type="hidden" name="id" value={r.id} /><button className="cursor-pointer text-xs text-muted hover:text-danger">Remove</button></form>
              </li>
            ))}
          </ul>
          <form action={addRuleAction} className="mt-3 flex items-end gap-2">
            <div><label className="label" htmlFor="occupancyPct">Occupancy %</label><input className="input w-24" id="occupancyPct" name="occupancyPct" type="number" min={1} max={100} required /></div>
            <div><label className="label" htmlFor="adjustPct">Change %</label><input className="input w-24" id="adjustPct" name="adjustPct" type="number" required /></div>
            <button className="btn">Add rule</button>
          </form>
        </div>

        <div className="card p-5">
          <h2 className="h2">Seasons</h2>
          <p className="mb-3 text-xs text-muted">Raise or lower the nightly rate for a date range.</p>
          <ul className="text-sm">
            {seasons.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-b border-line py-2">
                <span><b>{s.name}</b> <span className="text-muted">{fmtDate(s.startDate)} to {fmtDate(s.endDate)}</span> · {Number(s.adjustPct) > 0 ? "+" : ""}{Number(s.adjustPct)}%</span>
                <form action={deleteSeasonAction}><input type="hidden" name="id" value={s.id} /><button className="cursor-pointer text-xs text-muted hover:text-danger">Remove</button></form>
              </li>
            ))}
          </ul>
          <form action={addSeasonAction} className="mt-3 flex flex-wrap items-end gap-2">
            <div><label className="label" htmlFor="sname">Name</label><input className="input w-28" id="sname" name="name" required /></div>
            <div><label className="label" htmlFor="startDate">From</label><input className="input" id="startDate" name="startDate" type="date" required /></div>
            <div><label className="label" htmlFor="endDate">To</label><input className="input" id="endDate" name="endDate" type="date" required /></div>
            <div><label className="label" htmlFor="sadj">Change %</label><input className="input w-20" id="sadj" name="adjustPct" type="number" required /></div>
            <button className="btn">Add</button>
          </form>
        </div>
      </div>

      <form action={savePricingAction} className="card p-5">
        <h2 className="h2 mb-3">Rules for every stay</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="dynamicPricing" defaultChecked={p.dynamicPricing} /> Adjust nightly rates automatically based on occupancy</label>
          <div><label className="label" htmlFor="weekendUpliftPct">Friday and Saturday uplift %</label><input className="input" id="weekendUpliftPct" name="weekendUpliftPct" type="number" step="0.5" defaultValue={Number(p.weekendUpliftPct)} /></div>
          <div><label className="label" htmlFor="weeklyDiscountPct">Discount for 7+ nights %</label><input className="input" id="weeklyDiscountPct" name="weeklyDiscountPct" type="number" step="0.5" defaultValue={Number(p.weeklyDiscountPct)} /></div>
          <div><label className="label" htmlFor="longTermMinNights">Long-term starts at (nights)</label><input className="input" id="longTermMinNights" name="longTermMinNights" type="number" defaultValue={p.longTermMinNights} /></div>
          <div><label className="label" htmlFor="taxRatePct">Tax rate %</label><input className="input" id="taxRatePct" name="taxRatePct" type="number" step="0.01" defaultValue={Number(p.taxRatePct)} /></div>
          <div><label className="label" htmlFor="cancelWindowDays">Free cancellation until (days before)</label><input className="input" id="cancelWindowDays" name="cancelWindowDays" type="number" defaultValue={p.cancelWindowDays} /></div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="taxLongTerm" defaultChecked={p.taxLongTerm} /> Charge tax on long-term stays</label>
        </div>
        <button className="btn btn-primary mt-4">Save</button>
      </form>

      <div className="card overflow-x-auto p-5">
        <h2 className="h2">What guests will pay: next 14 nights</h2>
        <p className="mb-3 text-xs text-muted">Price for a one-night stay booked right now. Hover a price to see why. Rust means a rule moved it off the base rate.</p>
        <table className="w-full text-center text-xs tabular-nums">
          <thead>
            <tr><th className="th">Night</th>{preview[0]?.nights.map((x) => <th key={x.date} className="px-1 py-1 font-medium text-muted">{fmtDate(x.date, { weekday: "short" })}<br />{fmtDate(x.date, { month: "numeric", day: "numeric" })}</th>)}</tr>
            <tr><th className="th">Park occupancy</th>{preview[0]?.nights.map((x) => <td key={x.date} className="px-1 py-1 text-muted">{pct(x.occupancy)}</td>)}</tr>
          </thead>
          <tbody>
            {preview.map(({ c, nights }) => (
              <tr key={c.id}>
                <td className="td text-left text-sm whitespace-nowrap">{c.name}</td>
                {nights.map((x) => (
                  <td key={x.date} title={x.notes.join(", ") || "Base rate"} className={`border-t border-line px-1 py-2 ${x.rate !== x.base ? "font-semibold text-dusk" : ""}`}>{money(x.rate, false)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
