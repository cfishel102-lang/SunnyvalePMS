import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtShort } from "@/lib/dates";
import { money } from "@/lib/format";
import { confirmCheckout } from "@/lib/payments";
import { paidTotal } from "@/lib/reservations";

export default async function Confirmation({ params, searchParams }: { params: Promise<{ slug: string; code: string }>; searchParams: Promise<{ session_id?: string }> }) {
  const { slug, code } = await params;
  const { session_id } = await searchParams;
  if (session_id) await confirmCheckout(session_id);
  const r = await db.reservation.findUnique({ where: { code }, include: { site: true, guest: true, property: true, payments: true } });
  if (!r || r.property.slug !== slug) notFound();
  const paid = paidTotal(r.payments);

  return (
    <div className="mx-auto max-w-lg">
      <div className="card p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pine-soft text-2xl text-pine">✓</div>
        <h1 className="h1 mt-4">You're booked, {r.guest.firstName}.</h1>
        <p className="mt-1 text-muted">Confirmation code</p>
        <p className="font-heading text-3xl font-medium tracking-widest">{r.code}</p>
        <dl className="mt-6 space-y-2 border-t border-line pt-6 text-left text-sm">
          <div className="flex justify-between"><dt className="text-muted">Site</dt><dd>{r.site.name}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Arrive</dt><dd>{fmtShort(r.checkIn)}, from {r.property.checkInTime}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Depart</dt><dd>{fmtShort(r.checkOut)}, by {r.property.checkOutTime}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Total</dt><dd className="tabular-nums">{money(r.total)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="tabular-nums">{money(paid)}</dd></div>
        </dl>
        {paid < Number(r.total) && <p className="mt-4 rounded-lg bg-amber-soft px-4 py-3 text-sm text-amber">We haven't received payment yet. The balance of {money(Number(r.total) - paid)} is due at check-in.</p>}
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Need to change plans?{" "}
        <Link className="underline" href={`/book/${slug}/manage?code=${r.code}&email=${encodeURIComponent(r.guest.email)}`}>Manage this reservation</Link>
      </p>
    </div>
  );
}
