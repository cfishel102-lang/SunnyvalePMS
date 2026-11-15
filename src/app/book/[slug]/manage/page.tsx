import { db } from "@/lib/db";
import { fmtShort, nightsBetween, today, toStr } from "@/lib/dates";
import { money, STATUS_LABEL } from "@/lib/format";
import { paidTotal } from "@/lib/reservations";
import { guestCancelAction, guestChangeAction } from "../../actions";

export default async function Manage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const code = (sp.code ?? "").toUpperCase().trim();
  const email = (sp.email ?? "").toLowerCase().trim();
  const found = code && email ? await db.reservation.findUnique({ where: { code }, include: { site: true, guest: true, property: true, payments: true } }) : null;
  const r = found && found.guest.email === email && found.property.slug === slug ? found : null;

  if (!r) {
    return (
      <form className="card mx-auto max-w-md p-6">
        <h1 className="h1">Find your reservation</h1>
        {(sp.error === "notfound" || (code && email)) && <p className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">We couldn't find a reservation with that code and email.</p>}
        <div className="mt-5 space-y-4">
          <div><label className="label" htmlFor="code">Confirmation code</label><input className="input uppercase" id="code" name="code" required defaultValue={code} /></div>
          <div><label className="label" htmlFor="email">Email used to book</label><input className="input" id="email" name="email" type="email" required defaultValue={email} /></div>
        </div>
        <button className="btn btn-primary mt-5 w-full">Find reservation</button>
      </form>
    );
  }

  const daysOut = nightsBetween(today(r.property.timezone), toStr(r.checkIn));
  const refundable = daysOut >= r.property.cancelWindowDays;
  const paid = paidTotal(r.payments);
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="code" value={r.code} />
      <input type="hidden" name="email" value={r.guest.email} />
    </>
  );

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {sp.notice === "cancelled" && <p className="rounded-lg bg-pine-soft px-4 py-3 text-sm text-pine-dark">Your reservation is cancelled.{paid === 0 ? " Any payment has been refunded to your card." : ""}</p>}
      {sp.notice === "changed" && <p className="rounded-lg bg-pine-soft px-4 py-3 text-sm text-pine-dark">Your dates are updated.</p>}
      {sp.error && sp.error !== "notfound" && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{sp.error}</p>}

      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted">Reservation {r.code}</p>
            <h1 className="h1">Site {r.site.name}</h1>
          </div>
          <span className={`badge ${r.status === "CANCELLED" ? "bg-danger-soft text-danger" : "bg-pine-soft text-pine-dark"}`}>{STATUS_LABEL[r.status]}</span>
        </div>
        <dl className="mt-5 space-y-2 border-t border-line pt-5 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Arrive</dt><dd>{fmtShort(r.checkIn)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Depart</dt><dd>{fmtShort(r.checkOut)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="tabular-nums">{money(r.total)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="tabular-nums">{money(paid)}</dd></div>
          {paid < Number(r.total) && r.status !== "CANCELLED" && <div className="flex justify-between text-amber"><dt>Due at check-in</dt><dd className="tabular-nums">{money(Number(r.total) - paid)}</dd></div>}
        </dl>
      </div>

      {r.status === "CONFIRMED" && (
        <>
          <form action={guestChangeAction} className="card p-6">
            <h2 className="h2">Change dates</h2>
            <p className="mt-1 text-sm text-muted">We'll keep you on site {r.site.name} if it's open and update the price.</p>
            {hidden}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="checkIn">Arrive</label><input className="input" type="date" id="checkIn" name="checkIn" required defaultValue={toStr(r.checkIn)} min={today(r.property.timezone)} /></div>
              <div><label className="label" htmlFor="checkOut">Depart</label><input className="input" type="date" id="checkOut" name="checkOut" required defaultValue={toStr(r.checkOut)} /></div>
            </div>
            <button className="btn mt-4">Update dates</button>
          </form>

          <details className="card p-6">
            <summary className="cursor-pointer font-semibold text-danger">Cancel this reservation</summary>
            <p className="mt-3 text-sm text-muted">
              {refundable
                ? `You're inside the free cancellation window, so we'll refund ${money(paid)} to your original payment method.`
                : `Arrival is less than ${r.property.cancelWindowDays} days away, so this reservation is no longer refundable online. Call the park if you need help.`}
            </p>
            <form action={guestCancelAction} className="mt-4">
              {hidden}
              <button className="btn btn-danger">Yes, cancel my reservation</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
