import { Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { addDays, isDateStr, nightsBetween, today } from "@/lib/dates";
import { ACCESS_LABEL, money } from "@/lib/format";
import { searchAvailability } from "@/lib/pricing";
import { staffCreateAction } from "../../../actions";

export default async function NewReservation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const sp = await searchParams;
  const now = today(property.timezone);
  const checkIn = isDateStr(sp.checkIn) ? sp.checkIn : now;
  const checkOut = isDateStr(sp.checkOut) && sp.checkOut > checkIn ? sp.checkOut : addDays(checkIn, 1);
  const rig = Number(sp.rig) || 0;
  const results = await searchAvailability(property.id, checkIn, checkOut, { rigLengthFt: rig });
  const nights = nightsBetween(checkIn, checkOut);
  const preferred = results.flatMap((c) => c.sites).find((s) => s.id === sp.site)?.id;

  return (
    <div className="max-w-3xl">
      <h1 className="h1 mb-4">New reservation</h1>
      <Flash sp={sp} />

      <form className="card flex flex-wrap items-end gap-3 p-4">
        {sp.site && <input type="hidden" name="site" value={sp.site} />}
        <div><label className="label" htmlFor="checkIn">Arrive</label><input className="input" type="date" id="checkIn" name="checkIn" defaultValue={checkIn} required /></div>
        <div><label className="label" htmlFor="checkOut">Depart</label><input className="input" type="date" id="checkOut" name="checkOut" defaultValue={checkOut} required /></div>
        <div><label className="label" htmlFor="rig">RV length (ft)</label><input className="input w-28" type="number" id="rig" name="rig" defaultValue={rig || ""} /></div>
        <button className="btn">Update availability</button>
        <p className="ml-auto text-sm text-muted">{nights} night{nights === 1 ? "" : "s"} · {nights >= property.longTermMinNights ? "Long-term (monthly rate)" : "Transient"}</p>
      </form>

      <form action={staffCreateAction} className="mt-4 space-y-4">
        <input type="hidden" name="checkIn" value={checkIn} />
        <input type="hidden" name="checkOut" value={checkOut} />
        <div className="card p-4">
          <h2 className="h2 mb-3">1. Choose a site</h2>
          {results.length === 0 && <p className="text-sm text-muted">Nothing is open for those dates.</p>}
          <div className="space-y-4">
            {results.map(({ siteClass: c, sites, quote }) => (
              <fieldset key={c.id}>
                <legend className="mb-1.5 flex w-full justify-between text-sm">
                  <span className="font-medium">{c.name} <span className="font-normal text-muted">· {ACCESS_LABEL[sites[0].accessType]}</span></span>
                  <span className="tabular-nums">{money(quote.avgNightly)}/night · <b>{money(quote.total)}</b> total</span>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {sites.map((x) => (
                    <label key={x.id} className="cursor-pointer">
                      <input type="radio" name="siteId" value={x.id} defaultChecked={x.id === preferred} required className="peer sr-only" />
                      <span className="block rounded-lg border border-line px-2.5 py-1 text-sm tabular-nums peer-checked:border-pine peer-checked:bg-pine peer-checked:text-on-pine hover:border-pine">
                        {x.name}{x.lengthFt ? <span className="text-[10px] opacity-70"> {x.lengthFt}ft</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h2 className="h2 mb-3">2. Guest</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><label className="label" htmlFor="firstName">First name</label><input className="input" id="firstName" name="firstName" required /></div>
            <div><label className="label" htmlFor="lastName">Last name</label><input className="input" id="lastName" name="lastName" required /></div>
            <div><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required /></div>
            <div><label className="label" htmlFor="phone">Phone</label><input className="input" id="phone" name="phone" /></div>
            <div><label className="label" htmlFor="rigType">RV type</label><input className="input" id="rigType" name="rigType" placeholder="Fifth wheel" /></div>
            <div><label className="label" htmlFor="rigLengthFt">RV length (ft)</label><input className="input" id="rigLengthFt" name="rigLengthFt" type="number" defaultValue={rig || ""} /></div>
            <div><label className="label" htmlFor="adults">Adults</label><input className="input" id="adults" name="adults" type="number" defaultValue={2} min={1} /></div>
            <div><label className="label" htmlFor="children">Children</label><input className="input" id="children" name="children" type="number" defaultValue={0} min={0} /></div>
            <div className="col-span-2 sm:col-span-4"><label className="label" htmlFor="notes">Notes</label><input className="input" id="notes" name="notes" /></div>
          </div>
        </div>

        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div className="mr-auto"><h2 className="h2">3. Payment taken now</h2><p className="text-xs text-muted">Leave at 0 to collect later. Any balance shows on the reservation.</p></div>
          <div><label className="label" htmlFor="payNow">Amount ($)</label><input className="input w-28" id="payNow" name="payNow" type="number" step="0.01" min={0} defaultValue={0} /></div>
          <div><label className="label" htmlFor="method">Method</label>
            <select className="input" id="method" name="method"><option>Card (terminal)</option><option>Cash</option><option>Check</option></select>
          </div>
          <button className="btn btn-primary">Create reservation</button>
        </div>
      </form>
    </div>
  );
}
