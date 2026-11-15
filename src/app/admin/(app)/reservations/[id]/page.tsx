import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash, StatusBadge } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtShort, toStr } from "@/lib/dates";
import { ACCESS_LABEL, money, SOURCE_LABEL } from "@/lib/format";
import { paidTotal } from "@/lib/reservations";
import { notesAction, paymentAction, refundAction, setStatusAction, staffCancelAction, staffChangeAction } from "../../../actions";

export default async function ReservationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const { id } = await params;
  const r = await db.reservation.findFirst({
    where: { id, propertyId: property.id },
    include: { guest: true, site: { include: { siteClass: true } }, payments: { orderBy: { createdAt: "asc" } } },
  });
  if (!r) notFound();
  const sites = await db.site.findMany({ where: { propertyId: property.id, active: true }, include: { siteClass: true } });
  sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const paid = paidTotal(r.payments);
  const balance = r.status === "CANCELLED" ? 0 : Math.round((Number(r.total) - paid) * 100) / 100;
  const open = r.status === "CONFIRMED" || r.status === "CHECKED_IN";
  const hid = <input type="hidden" name="id" value={r.id} />;

  return (
    <div className="max-w-4xl">
      <Link href="/admin/reservations" className="text-sm text-muted hover:text-ink">← Reservations</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="h1">{r.guest.firstName} {r.guest.lastName}</h1>
        <StatusBadge status={r.status} />
        <span className="badge bg-paper text-muted">{r.stayType === "LONG_TERM" ? "Long-term" : "Transient"}</span>
        <span className="text-sm text-muted">{r.code} · {SOURCE_LABEL[r.source]}</span>
        <div className="ml-auto flex gap-2">
          {r.status === "CONFIRMED" && <form action={setStatusAction}>{hid}<input type="hidden" name="status" value="CHECKED_IN" /><button className="btn btn-primary">Check in</button></form>}
          {r.status === "CHECKED_IN" && <form action={setStatusAction}>{hid}<input type="hidden" name="status" value="CHECKED_OUT" /><button className="btn btn-primary">Check out</button></form>}
        </div>
      </div>
      <Flash sp={await searchParams} />

      <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <div className="card grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-4">
            <div><p className="label">Site</p><p className="text-lg font-semibold">{r.site.name}</p><p className="text-xs text-muted">{ACCESS_LABEL[r.site.accessType]} · {r.site.lengthFt} ft</p></div>
            <div><p className="label">Arrive</p><p className="font-medium">{fmtShort(r.checkIn)}</p><p className="text-xs text-muted">{fmtDate(r.checkIn, { year: "numeric" })}</p></div>
            <div><p className="label">Depart</p><p className="font-medium">{fmtShort(r.checkOut)}</p><p className="text-xs text-muted">{r.nights} nights</p></div>
            <div><p className="label">Party</p><p className="font-medium">{r.adults} adult{r.adults === 1 ? "" : "s"}{r.children ? `, ${r.children} child${r.children === 1 ? "" : "ren"}` : ""}</p><p className="text-xs text-muted">{r.rigType}{r.rigLengthFt ? ` · ${r.rigLengthFt} ft` : ""}</p></div>
            <div className="col-span-2"><p className="label">Email</p><p>{r.guest.email}</p></div>
            <div className="col-span-2"><p className="label">Phone</p><p>{r.guest.phone || "—"}</p></div>
          </div>

          {open && (
            <form action={staffChangeAction} className="card p-5">
              <h2 className="h2">Change dates or site</h2>
              <p className="mb-3 text-xs text-muted">The stay is re-priced at current rates when you save.</p>
              {hid}
              <div className="flex flex-wrap items-end gap-3">
                <div><label className="label" htmlFor="checkIn">Arrive</label><input className="input" type="date" id="checkIn" name="checkIn" defaultValue={toStr(r.checkIn)} required /></div>
                <div><label className="label" htmlFor="checkOut">Depart</label><input className="input" type="date" id="checkOut" name="checkOut" defaultValue={toStr(r.checkOut)} required /></div>
                <div><label className="label" htmlFor="siteId">Site</label>
                  <select className="input" id="siteId" name="siteId" defaultValue={r.siteId}>
                    {sites.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.lengthFt} ft · {x.siteClass.name}</option>)}
                  </select>
                </div>
                <button className="btn">Save changes</button>
              </div>
            </form>
          )}

          <form action={notesAction} className="card p-5">
            <h2 className="h2 mb-2">Notes</h2>
            {hid}
            <textarea className="input" name="notes" rows={2} defaultValue={r.notes} />
            <button className="btn btn-sm mt-2">Save notes</button>
          </form>

          {open && (
            <details className="card p-5">
              <summary className="cursor-pointer font-semibold text-danger">Cancel reservation</summary>
              <form action={staffCancelAction} className="mt-3 flex flex-wrap items-end gap-3">
                {hid}
                <div><label className="label" htmlFor="refund">Refund amount ($)</label><input className="input w-32" id="refund" name="refund" type="number" step="0.01" min={0} max={paid} defaultValue={paid} /></div>
                <button className="btn btn-danger">Cancel and refund</button>
                <p className="w-full text-xs text-muted">The guest has paid {money(paid)}. Card payments are refunded to the card.</p>
              </form>
            </details>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5 text-sm tabular-nums">
            <h2 className="h2 mb-3">Charges</h2>
            <div className="flex justify-between"><span className="text-muted">{r.nights} nights</span><span>{money(r.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Tax</span><span>{money(r.tax)}</span></div>
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span>{money(r.total)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Paid</span><span>{money(paid)}</span></div>
            <div className={`mt-2 flex justify-between rounded-lg px-3 py-2 font-semibold ${balance > 0 ? "bg-amber-soft text-amber" : balance < 0 ? "bg-dusk-soft text-dusk" : "bg-pine-soft text-pine-dark"}`}>
              <span>{balance < 0 ? "Credit owed to guest" : "Balance due"}</span><span>{money(Math.abs(balance))}</span>
            </div>
          </div>

          <div className="card p-5 text-sm">
            <h2 className="h2 mb-2">Payments</h2>
            {r.payments.length === 0 && <p className="text-muted">Nothing recorded yet.</p>}
            <ul>
              {r.payments.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-line py-1.5 last:border-0">
                  <span>{p.method}<span className="block text-xs text-muted">{fmtDate(p.createdAt)}{p.note ? ` · ${p.note}` : ""}</span></span>
                  <span className={`tabular-nums ${Number(p.amount) < 0 ? "text-danger" : ""}`}>{money(p.amount)}</span>
                </li>
              ))}
            </ul>
            <form action={paymentAction} className="mt-3 flex items-end gap-2 border-t border-line pt-3">
              {hid}
              <div className="flex-1"><label className="label" htmlFor="amount">Take payment ($)</label><input className="input" id="amount" name="amount" type="number" step="0.01" min={0} defaultValue={balance > 0 ? balance : ""} /></div>
              <select className="input w-28" name="method" aria-label="Method"><option>Card (terminal)</option><option>Cash</option><option>Check</option></select>
              <button className="btn">Add</button>
            </form>
            {paid > 0 && (
              <form action={refundAction} className="mt-2 flex items-end gap-2">
                {hid}
                <div className="flex-1"><label className="label" htmlFor="ramount">Refund ($)</label><input className="input" id="ramount" name="amount" type="number" step="0.01" min={0} max={paid} /></div>
                <button className="btn btn-danger">Refund</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
