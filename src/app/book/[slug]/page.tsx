import { db } from "@/lib/db";
import { addDays, fmtShort, isDateStr, nightsBetween, today } from "@/lib/dates";
import { ACCESS_LABEL, money } from "@/lib/format";
import { searchAvailability } from "@/lib/pricing";

export default async function BookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const property = await db.property.findUniqueOrThrow({ where: { slug } });
  const now = today(property.timezone);
  const checkIn = isDateStr(sp.checkIn) ? sp.checkIn : "";
  const checkOut = isDateStr(sp.checkOut) ? sp.checkOut : "";
  const rig = Number(sp.rig) || 0;
  const access = sp.access === "BACK_IN" || sp.access === "PULL_THROUGH" ? sp.access : null;

  let problem = "";
  if (checkIn && checkOut) {
    if (checkIn < now) problem = "Arrival can't be in the past.";
    else if (checkOut <= checkIn) problem = "Departure must be after arrival.";
    else if (nightsBetween(checkIn, checkOut) > 366) problem = "Please book stays longer than a year by phone.";
  }
  const searched = Boolean(checkIn && checkOut && !problem);
  const results = searched ? await searchAvailability(property.id, checkIn, checkOut, { rigLengthFt: rig, accessType: access }) : [];
  const nights = searched ? nightsBetween(checkIn, checkOut) : 0;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Book your stay</h1>
      <p className="mt-1 text-muted">{property.tagline}</p>

      <form className="card mt-6 grid grid-cols-2 gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="checkIn">Arrive</label>
          <input className="input" type="date" id="checkIn" name="checkIn" required min={now} defaultValue={checkIn || addDays(now, 1)} />
        </div>
        <div>
          <label className="label" htmlFor="checkOut">Depart</label>
          <input className="input" type="date" id="checkOut" name="checkOut" required min={addDays(now, 1)} defaultValue={checkOut || addDays(now, 3)} />
        </div>
        <div>
          <label className="label" htmlFor="rig">RV length (ft)</label>
          <input className="input" type="number" id="rig" name="rig" min={0} max={100} placeholder="e.g. 36" defaultValue={rig || ""} />
        </div>
        <div>
          <label className="label" htmlFor="access">Site access</label>
          <select className="input" id="access" name="access" defaultValue={access ?? ""}>
            <option value="">Any</option>
            <option value="PULL_THROUGH">Pull-through</option>
            <option value="BACK_IN">Back-in</option>
          </select>
        </div>
        <button className="btn btn-primary col-span-2 sm:col-span-1">Check availability</button>
      </form>

      {problem && <p className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{problem}</p>}

      {searched && (
        <section className="mt-8">
          <p className="text-sm text-muted">
            {fmtShort(checkIn)} to {fmtShort(checkOut)} · {nights} night{nights === 1 ? "" : "s"}
            {nights >= property.longTermMinNights && " · monthly rate applied"}
          </p>
          {results.length === 0 && (
            <div className="card mt-3 p-8 text-center">
              <p className="font-medium">No sites are open for those dates{rig ? ` for a ${rig} ft rig` : ""}.</p>
              <p className="mt-1 text-sm text-muted">Try different dates or a shorter stay.</p>
            </div>
          )}
          <div className="mt-3 space-y-3">
            {results.map(({ siteClass: c, sites, quote }) => {
              const lens = sites.map((x) => x.lengthFt);
              return (
                <form key={c.id} action={`/book/${slug}/checkout`} className="card p-5 sm:flex sm:items-center sm:gap-6">
                  <input type="hidden" name="checkIn" value={checkIn} />
                  <input type="hidden" name="checkOut" value={checkOut} />
                  <input type="hidden" name="rig" value={rig || ""} />
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold">{c.name}</h2>
                    <p className="mt-0.5 text-sm text-muted">{c.description}</p>
                    <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      <span className="badge bg-pine-soft text-pine-dark">{ACCESS_LABEL[sites[0].accessType]}</span>
                      <span className="badge bg-paper text-muted">{sites[0].hookups} hookups</span>
                      <span className="badge bg-paper text-muted">{sites[0].amps} amp</span>
                      <span className="badge bg-paper text-muted">Fits up to {Math.max(...lens)} ft</span>
                      {sites.length <= 3 && <span className="badge bg-amber-soft text-amber">Only {sites.length} left</span>}
                    </p>
                  </div>
                  <div className="mt-4 sm:mt-0 sm:w-56">
                    <p className="sm:text-right">
                      <span className="text-2xl font-semibold tabular-nums">{money(quote.avgNightly, false)}</span>
                      <span className="text-sm text-muted"> / night</span>
                      <span className="block text-xs text-muted">{money(quote.total)} total with tax</span>
                    </p>
                    <div className="mt-2 flex gap-2">
                      <select name="site" className="input" aria-label="Choose a site">
                        {sites.map((x) => (
                          <option key={x.id} value={x.id}>Site {x.name} · {x.lengthFt} ft</option>
                        ))}
                      </select>
                      <button className="btn btn-primary">Reserve</button>
                    </div>
                  </div>
                </form>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
