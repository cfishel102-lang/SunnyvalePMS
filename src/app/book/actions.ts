"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { nightsBetween, today, toStr } from "@/lib/dates";
import { paymentsLive, refund, startCheckout } from "@/lib/payments";
import { BookingError, cancelReservation, changeReservation, createReservation, paidTotal } from "@/lib/reservations";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function bookAction(form: FormData) {
  const slug = s(form, "slug");
  const property = await db.property.findUniqueOrThrow({ where: { slug } });
  const back = new URLSearchParams({ site: s(form, "siteId"), checkIn: s(form, "checkIn"), checkOut: s(form, "checkOut"), rig: s(form, "rigLengthFt") });
  let url: string;
  try {
    const r = await createReservation({
      propertyId: property.id,
      siteId: s(form, "siteId"),
      checkIn: s(form, "checkIn"),
      checkOut: s(form, "checkOut"),
      guest: { firstName: s(form, "firstName"), lastName: s(form, "lastName"), email: s(form, "email"), phone: s(form, "phone") },
      adults: Number(s(form, "adults")) || 2,
      children: Number(s(form, "children")) || 0,
      rigType: s(form, "rigType"),
      rigLengthFt: Number(s(form, "rigLengthFt")) || null,
      notes: s(form, "notes"),
      source: "WEBSITE",
      holdMinutes: paymentsLive ? 20 : undefined,
    });
    url = await startCheckout(r.id);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    back.set("error", e.message);
    redirect(`/book/${slug}/checkout?${back}`);
  }
  redirect(url);
}

async function guestReservation(form: FormData) {
  const r = await db.reservation.findUnique({ where: { code: s(form, "code").toUpperCase() }, include: { guest: true, property: true, payments: true } });
  if (!r || r.guest.email !== s(form, "email").toLowerCase()) redirect(`/book/${s(form, "slug")}/manage?error=notfound`);
  return r;
}

/** Guest self-service cancel. Refunds in full when inside the free-cancellation window. */
export async function guestCancelAction(form: FormData) {
  const r = await guestReservation(form);
  const q = new URLSearchParams({ code: r.code, email: r.guest.email });
  try {
    const daysOut = nightsBetween(today(r.property.timezone), toStr(r.checkIn));
    if (r.status !== "CONFIRMED") throw new BookingError("Please contact the park to cancel this reservation.");
    await cancelReservation(r.id);
    const paid = paidTotal(r.payments);
    if (daysOut >= r.property.cancelWindowDays && paid > 0) await refund(r.id, paid, "Guest cancelled online");
    q.set("notice", "cancelled");
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    q.set("error", e.message);
  }
  redirect(`/book/${r.property.slug}/manage?${q}`);
}

/** Guest self-service date change. Any price drop is refunded; any increase is due at check-in. */
export async function guestChangeAction(form: FormData) {
  const r = await guestReservation(form);
  const q = new URLSearchParams({ code: r.code, email: r.guest.email });
  try {
    if (r.status !== "CONFIRMED") throw new BookingError("Please contact the park to change this reservation.");
    const updated = await changeReservation(r.id, { checkIn: s(form, "checkIn"), checkOut: s(form, "checkOut") });
    const over = paidTotal(r.payments) - Number(updated.total);
    if (over > 0) await refund(r.id, over, "Dates changed online");
    q.set("notice", "changed");
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    q.set("error", e.message);
  }
  redirect(`/book/${r.property.slug}/manage?${q}`);
}
