import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, toDate, today } from "@/lib/dates";
import { money, SOURCE_LABEL } from "@/lib/format";
import { paidTotal } from "@/lib/reservations";

const VIEWS = { upcoming: "Upcoming", inhouse: "In house", past: "Past", cancelled: "Cancelled", all: "All" };

export default async function Reservations({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const { property } = await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const view = q ? "all" : sp.view && sp.view in VIEWS ? sp.view : "upcoming";
  const d = toDate(today(property.timezone));
  const where: Prisma.ReservationWhereInput = { propertyId: property.id };
  if (view === "upcoming") Object.assign(where, { status: "CONFIRMED", checkIn: { gte: d } });
  if (view === "inhouse") Object.assign(where, { status: "CHECKED_IN" });
  if (view === "past") Object.assign(where, { status: "CHECKED_OUT" });
  if (view === "cancelled") Object.assign(where, { status: "CANCELLED" });
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { guest: { lastName: { contains: q, mode: "insensitive" } } },
      { guest: { firstName: { contains: q, mode: "insensitive" } } },
      { guest: { email: { contains: q, mode: "insensitive" } } },
      { site: { name: q } },
    ];
  }
  const rows = await db.reservation.findMany({
    where, include: { guest: true, site: true, payments: true }, take: 200,
    orderBy: { checkIn: view === "upcoming" || view === "inhouse" ? "asc" : "desc" },
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Reservations</h1>
        <form className="flex gap-2">
          <input className="input w-64" name="q" defaultValue={q} placeholder="Search name, email, code or site" />
          <button className="btn">Search</button>
        </form>
      </div>
      <div className="mb-3 flex gap-1 text-sm">
        {Object.entries(VIEWS).map(([k, label]) => (
          <Link key={k} href={`/admin/reservations?view=${k}`} className={`rounded-lg px-3 py-1.5 ${view === k && !q ? "bg-ink text-white" : "text-muted hover:bg-surface"}`}>{label}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th">Guest</th><th className="th">Site</th><th className="th">Arrive</th><th className="th">Depart</th><th className="th num">Nights</th>
            <th className="th">Source</th><th className="th">Status</th><th className="th num">Total</th><th className="th num">Balance</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const bal = r.status === "CANCELLED" ? 0 : Number(r.total) - paidTotal(r.payments);
              return (
                <tr key={r.id} className="hover:bg-paper/60">
                  <td className="td"><Link href={`/admin/reservations/${r.id}`} className="font-medium hover:underline">{r.guest.firstName} {r.guest.lastName}</Link><span className="ml-2 text-xs text-muted">{r.code}</span></td>
                  <td className="td tabular-nums">{r.site.name}</td>
                  <td className="td whitespace-nowrap">{fmtDate(r.checkIn)}</td>
                  <td className="td whitespace-nowrap">{fmtDate(r.checkOut)}</td>
                  <td className="td num">{r.nights}</td>
                  <td className="td text-muted">{SOURCE_LABEL[r.source]}</td>
                  <td className="td"><StatusBadge status={r.status} /></td>
                  <td className="td num">{money(r.total)}</td>
                  <td className={`td num ${bal > 0.005 ? "font-medium text-amber" : "text-muted"}`}>{money(bal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted">No reservations here.</p>}
      </div>
      {rows.length === 200 && <p className="mt-2 text-xs text-muted">Showing the first 200. Search to narrow down.</p>}
    </>
  );
}
