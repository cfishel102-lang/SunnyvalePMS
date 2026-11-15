import Link from "next/link";
import { SiteMap, type Pin } from "@/components/SiteMap";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, fmtShort, isDateStr, nightsBetween, toDate, toStr, today } from "@/lib/dates";

const DAYS = 21;

type Params = { start?: string; view?: string; from?: string; to?: string };

const Tabs = ({ view }: { view: "chart" | "map" }) => (
  <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm">
    {(["chart", "map"] as const).map((v) => (
      <Link key={v} href={`/admin/calendar?view=${v}`} className={`rounded-md px-3 py-1 ${view === v ? "bg-pine text-on-pine" : "text-muted hover:text-ink"}`}>{v === "chart" ? "Chart" : "Map"}</Link>
    ))}
  </div>
);

/** The same inventory as the chart, drawn on the park map for one period. */
async function MapView({ propertyId, slug, now, sp }: { propertyId: string; slug: string; now: string; sp: Params }) {
  const from = isDateStr(sp.from) ? sp.from : now;
  const to = isDateStr(sp.to) && sp.to > from ? sp.to : addDays(from, 1);
  const nights = nightsBetween(from, to);
  const [map, sites] = await Promise.all([
    db.propertyMap.findFirst({ where: { propertyId, appliedAt: { not: null } }, select: { createdAt: true } }),
    db.site.findMany({
      where: { propertyId, mapX: { not: null } },
      include: {
        siteClass: true,
        reservations: { where: { status: { not: "CANCELLED" }, checkIn: { lt: toDate(to) }, checkOut: { gt: toDate(from) } }, include: { guest: true }, orderBy: { checkIn: "asc" } },
      },
    }),
  ]);
  const KEY = { open: ["#ffffff", `Open for all ${nights} night${nights === 1 ? "" : "s"}`], taken: ["var(--color-dusk)", "Booked for some or all of it"], off: ["#9a9a8e", "Not bookable"] } as const;
  const pins: (Pin & { state: keyof typeof KEY })[] = sites.map((s) => {
    const r = s.reservations[0];
    const state = !s.active ? "off" : r ? "taken" : "open";
    const who = s.reservations.map((x) => `${x.guest.firstName} ${x.guest.lastName}, ${fmtShort(x.checkIn)} to ${fmtShort(x.checkOut)}`).join("; ");
    return {
      state, name: s.name, x: s.mapX!, y: s.mapY!, color: KEY[state][0], text: state === "open" ? "#262b20" : "#fff",
      title: `Site ${s.name} · ${s.siteClass.name}${who ? ` · ${who}` : state === "open" ? " · open, click to book" : ""}`,
      href: r ? `/admin/reservations/${r.id}` : s.active ? `/admin/reservations/new?checkIn=${from}&checkOut=${to}&site=${s.id}` : undefined,
    };
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="h1">Booking chart</h1>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex items-end gap-2">
            <input type="hidden" name="view" value="map" />
            <div><label className="label" htmlFor="from">From</label><input className="input input-sm" type="date" id="from" name="from" defaultValue={from} required /></div>
            <div><label className="label" htmlFor="to">To</label><input className="input input-sm" type="date" id="to" name="to" defaultValue={to} required /></div>
            <button className="btn btn-sm">Show</button>
          </form>
          <Tabs view="map" />
        </div>
      </div>
      {!map ? (
        <div className="card p-6 text-sm">No park map has been imported yet. <Link className="underline" href="/admin/map">Upload your map</Link> to see your sites here.</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
            <b>{fmtShort(from)} to {fmtShort(to)}</b>
            {(Object.keys(KEY) as (keyof typeof KEY)[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-full ring-1 ring-ink/30" style={{ background: KEY[k][0] }} />{KEY[k][1]} <b>{pins.filter((p) => p.state === k).length}</b></span>
            ))}
          </div>
          <SiteMap src={`/api/map/${slug}?v=${map.createdAt.getTime()}`} alt="Park map" pins={pins} />
          <p className="mt-2 text-xs text-muted">Click an open site to book it for this period. Click a booked site to open the reservation. Hover any site for details.</p>
        </>
      )}
    </>
  );
}

export default async function BookingChart({ searchParams }: { searchParams: Promise<Params> }) {
  const { property } = await requireStaff();
  const sp = await searchParams;
  const now = today(property.timezone);
  if (sp.view === "map") return <MapView propertyId={property.id} slug={property.slug} now={now} sp={sp} />;
  const start = isDateStr(sp.start) ? sp.start : addDays(now, -2);
  const end = addDays(start, DAYS);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));

  const classes = await db.siteClass.findMany({
    where: { propertyId: property.id },
    orderBy: { sortOrder: "asc" },
    include: {
      sites: {
        where: { active: true },
        include: {
          reservations: {
            where: { status: { not: "CANCELLED" }, checkIn: { lt: toDate(end) }, checkOut: { gt: toDate(start) } },
            include: { guest: true },
          },
        },
      },
    },
  });
  const cols = { gridTemplateColumns: `repeat(${DAYS}, minmax(2.5rem, 1fr))` };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Booking chart</h1>
        <div className="flex items-center gap-2">
          <span className="mr-2 hidden items-center gap-3 text-xs text-muted lg:flex">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-pine" />Transient</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-dusk" />Long-term</span>
          </span>
          <Link className="btn btn-sm" href={`/admin/calendar?start=${addDays(start, -14)}`}>← Earlier</Link>
          <Link className="btn btn-sm" href="/admin/calendar">Today</Link>
          <Link className="btn btn-sm" href={`/admin/calendar?start=${addDays(start, 14)}`}>Later →</Link>
          <form><input type="date" name="start" defaultValue={start} className="input input-sm" aria-label="Jump to date" /></form>
          <Tabs view="chart" />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="min-w-[60rem]">
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface text-center text-xs">
            <div className="w-24 shrink-0" />
            <div className="grid flex-1" style={cols}>
              {days.map((d) => {
                const wd = toDate(d).getUTCDay();
                return (
                  <div key={d} className={`py-1.5 ${d === now ? "bg-pine-soft font-semibold text-pine-dark" : wd === 5 || wd === 6 ? "bg-paper text-muted" : "text-muted"}`}>
                    <div>{fmtDate(d, { weekday: "narrow" })}</div>
                    <div className="text-ink">{fmtDate(d, { day: "numeric" })}</div>
                    <div className="text-[10px]">{d.endsWith("-01") || d === start ? fmtDate(d, { month: "short" }) : " "}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {classes.filter((c) => c.sites.length > 0).map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-1 text-xs font-medium text-muted"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.name} <span className="font-normal">· {c.sites.length} sites</span></div>
              {c.sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((site) => (
                <div key={site.id} className="flex border-b border-line last:border-b-0">
                  <div className="flex w-24 shrink-0 items-baseline gap-1.5 px-3 py-2 text-sm">
                    <span className="font-semibold tabular-nums">{site.name}</span>
                    <span className="text-[10px] text-muted">{site.lengthFt ? `${site.lengthFt}ft ` : ""}{site.accessType === "PULL_THROUGH" ? "PT" : "BI"}{site.accessible ? " ♿" : ""}</span>
                  </div>
                  <div className="grid flex-1" style={cols}>
                    {days.map((d, i) => (
                      <Link
                        key={d}
                        href={`/admin/reservations/new?checkIn=${d}&checkOut=${addDays(d, 1)}&site=${site.id}`}
                        title={`Book site ${site.name} from ${fmtDate(d)}`}
                        className={`border-l border-line hover:bg-pine-soft ${d === now ? "bg-pine-soft/50" : ""}`}
                        style={{ gridColumn: i + 1, gridRow: 1 }}
                      />
                    ))}
                    {site.reservations.map((r) => {
                      const from = Math.max(0, nightsBetween(start, toStr(r.checkIn)));
                      const to = Math.min(DAYS, nightsBetween(start, toStr(r.checkOut)));
                      const tone = r.stayType === "LONG_TERM" ? "bg-dusk text-on-dusk" : "bg-pine text-on-pine";
                      return (
                        <Link
                          key={r.id}
                          href={`/admin/reservations/${r.id}`}
                          title={`${r.guest.firstName} ${r.guest.lastName} · ${fmtDate(r.checkIn)} to ${fmtDate(r.checkOut)}`}
                          className={`z-10 my-1 ml-0.5 truncate rounded-md px-2 py-1 text-xs font-medium hover:brightness-110 ${tone} ${r.status === "CHECKED_OUT" ? "opacity-50" : ""}`}
                          style={{ gridColumn: `${from + 1} / ${to + 1}`, gridRow: 1 }}
                        >
                          {r.guest.lastName}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">One row per site from your park map. Click an empty square to book that site from that night. Click a stay to open, move or cancel it.</p>
    </>
  );
}
