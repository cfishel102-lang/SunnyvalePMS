import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { fmtShort, isDateStr } from "@/lib/dates";
import { ACCESS_LABEL, money } from "@/lib/format";
import { paymentsLive } from "@/lib/payments";
import { loadPricingContext, quoteStay } from "@/lib/pricing";
import { bookAction } from "../../actions";

export default async function Checkout({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { checkIn, checkOut } = sp;
  if (!isDateStr(checkIn) || !isDateStr(checkOut) || checkOut <= checkIn || !sp.site) redirect(`/book/${slug}`);
  const property = await db.property.findUniqueOrThrow({ where: { slug } });
  const site = await db.site.findFirst({ where: { id: sp.site, propertyId: property.id }, include: { siteClass: true } });
  if (!site) redirect(`/book/${slug}`);
  const quote = quoteStay(await loadPricingContext(property.id, checkIn, checkOut), site.siteClass, checkIn, checkOut);
  const n = quote.nights.length;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <form action={bookAction} className="card p-6">
        <h1 className="h1">Your details</h1>
        {sp.error && <p className="mt-4 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">{sp.error}</p>}
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="siteId" value={site.id} />
        <input type="hidden" name="checkIn" value={checkIn} />
        <input type="hidden" name="checkOut" value={checkOut} />
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div><label className="label" htmlFor="firstName">First name</label><input className="input" id="firstName" name="firstName" required autoComplete="given-name" /></div>
          <div><label className="label" htmlFor="lastName">Last name</label><input className="input" id="lastName" name="lastName" required autoComplete="family-name" /></div>
          <div className="col-span-2 sm:col-span-1"><label className="label" htmlFor="email">Email</label><input className="input" id="email" name="email" type="email" required autoComplete="email" /></div>
          <div className="col-span-2 sm:col-span-1"><label className="label" htmlFor="phone">Mobile phone</label><input className="input" id="phone" name="phone" type="tel" autoComplete="tel" /></div>
          <div>
            <label className="label" htmlFor="rigType">RV type</label>
            <select className="input" id="rigType" name="rigType">
              {["Class A", "Class B / van", "Class C", "Fifth wheel", "Travel trailer", "Truck camper", "Other"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="rigLengthFt">RV length (ft)</label><input className="input" id="rigLengthFt" name="rigLengthFt" type="number" min={1} max={site.lengthFt ?? 100} required defaultValue={sp.rig || ""} /></div>
          <div><label className="label" htmlFor="adults">Adults</label><input className="input" id="adults" name="adults" type="number" min={1} max={10} defaultValue={2} /></div>
          <div><label className="label" htmlFor="children">Children</label><input className="input" id="children" name="children" type="number" min={0} max={10} defaultValue={0} /></div>
          <div className="col-span-2"><label className="label" htmlFor="notes">Anything we should know? (optional)</label><textarea className="input" id="notes" name="notes" rows={2} /></div>
        </div>
        <button className="btn btn-cta btn-lg mt-6 w-full">{paymentsLive ? `Continue to payment · ${money(quote.total)}` : `Confirm reservation · ${money(quote.total)}`}</button>
        <p className="mt-3 text-center text-xs text-muted">
          {paymentsLive ? "You'll pay securely by card on the next screen." : "Demo mode: no card is charged."} Free cancellation up to {property.cancelWindowDays} days before arrival.
        </p>
      </form>

      <aside className="card h-fit p-5 text-sm">
        <h2 className="h2">Site {site.name}</h2>
        <p className="text-muted">{site.siteClass.name}</p>
        <p className="mt-1 text-muted">{ACCESS_LABEL[site.accessType]}{site.lengthFt ? ` · ${site.lengthFt} ft` : ""} · {site.hookups} hookups · {site.amps} amp{site.accessible ? " · Accessible" : ""}</p>
        <dl className="mt-4 space-y-1 border-t border-line pt-4">
          <div className="flex justify-between"><dt className="text-muted">Arrive</dt><dd>{fmtShort(checkIn)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Depart</dt><dd>{fmtShort(checkOut)}</dd></div>
        </dl>
        <dl className="mt-4 space-y-1 border-t border-line pt-4 tabular-nums">
          {n <= 7 && quote.stayType === "TRANSIENT" ? (
            quote.nights.map((x) => (
              <div key={x.date} className="flex justify-between"><dt className="text-muted">{fmtShort(x.date)}</dt><dd>{money(x.rate)}</dd></div>
            ))
          ) : (
            <div className="flex justify-between">
              <dt className="text-muted">{n} nights{quote.stayType === "LONG_TERM" ? " at monthly rate" : ""}</dt>
              <dd>{money(quote.subtotal + quote.discount)}</dd>
            </div>
          )}
          {quote.discount > 0 && <div className="flex justify-between text-pine"><dt>Weekly discount</dt><dd>−{money(quote.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-muted">Tax</dt><dd>{money(quote.tax)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{money(quote.total)}</dd></div>
        </dl>
        <Link href={`/book/${slug}?checkIn=${checkIn}&checkOut=${checkOut}`} className="mt-4 inline-block text-xs text-muted underline">Change dates or site</Link>
      </aside>
    </div>
  );
}
