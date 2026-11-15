import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, isDateStr, nightsBetween, toDate, toStr, today } from "@/lib/dates";

const DAYS = 21;

export default async function Calendar({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const { property } = await requireStaff();
  const sp = await searchParams;
  const now = today(property.timezone);
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
        <h1 className="h1">Calendar</h1>
        <div className="flex items-center gap-2">
          <span className="mr-2 hidden items-center gap-3 text-xs text-muted lg:flex">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-pine" />Transient</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-dusk" />Long-term</span>
          </span>
          <Link className="btn btn-sm" href={`/admin/calendar?start=${addDays(start, -14)}`}>← Earlier</Link>
          <Link className="btn btn-sm" href="/admin/calendar">Today</Link>
          <Link className="btn btn-sm" href={`/admin/calendar?start=${addDays(start, 14)}`}>Later →</Link>
          <form><input type="date" name="start" defaultValue={start} className="input input-sm" aria-label="Jump to date" /></form>
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

          {classes.map((c) => (
            <div key={c.id}>
              <div className="border-b border-line bg-paper px-3 py-1 text-xs font-medium text-muted">{c.name}</div>
              {c.sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((site) => (
                <div key={site.id} className="flex border-b border-line last:border-b-0">
                  <div className="flex w-24 shrink-0 items-baseline gap-1.5 px-3 py-2 text-sm">
                    <span className="font-semibold tabular-nums">{site.name}</span>
                    <span className="text-[10px] text-muted">{site.lengthFt ? `${site.lengthFt}ft ` : ""}{site.accessType === "PULL_THROUGH" ? "PT" : "BI"}</span>
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
      <p className="mt-2 text-xs text-muted">Click an empty square to book that site. Click a stay to open it.</p>
    </>
  );
}
