"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiKey, requireStaff, signIn, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDateStr, toDate } from "@/lib/dates";
import { refund } from "@/lib/payments";
import { BookingError, cancelReservation, changeReservation, createReservation } from "@/lib/reservations";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(s(f, k)) || 0;

/** Run a staff action, then go to `to` with a success or error message. */
async function run(to: string, ok: string, fn: () => Promise<string | void>): Promise<never> {
  const sep = to.includes("?") ? "&" : "?";
  let dest = to;
  try {
    dest = (await fn()) ?? to;
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    redirect(`${to}${sep}error=${encodeURIComponent(e.message)}`);
  }
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}notice=${encodeURIComponent(ok)}`);
}

export async function loginAction(form: FormData) {
  const user = await db.user.findUnique({ where: { email: s(form, "email").toLowerCase() } });
  if (!user || !(await bcrypt.compare(s(form, "password"), user.passwordHash))) redirect("/admin/login?error=1");
  await signIn(user.id);
  redirect("/admin");
}
export async function logoutAction() {
  await signOut();
  redirect("/admin/login");
}

// ---- Reservations ----

export async function staffCreateAction(form: FormData) {
  const { property } = await requireStaff();
  const back = `/admin/reservations/new?checkIn=${s(form, "checkIn")}&checkOut=${s(form, "checkOut")}&rig=${s(form, "rigLengthFt")}`;
  await run(back, "Reservation created.", async () => {
    if (!s(form, "siteId")) throw new BookingError("Choose a site.");
    const r = await createReservation({
      propertyId: property.id,
      siteId: s(form, "siteId"),
      checkIn: s(form, "checkIn"),
      checkOut: s(form, "checkOut"),
      guest: { firstName: s(form, "firstName"), lastName: s(form, "lastName"), email: s(form, "email"), phone: s(form, "phone") },
      adults: n(form, "adults") || 2,
      children: n(form, "children"),
      rigType: s(form, "rigType"),
      rigLengthFt: n(form, "rigLengthFt") || null,
      notes: s(form, "notes"),
      source: "STAFF",
    });
    const paid = n(form, "payNow");
    if (paid > 0) await db.payment.create({ data: { reservationId: r.id, amount: paid, method: s(form, "method") || "Card (terminal)" } });
    return `/admin/reservations/${r.id}`;
  });
}

async function owned(form: FormData) {
  const { property } = await requireStaff();
  const r = await db.reservation.findFirst({ where: { id: s(form, "id"), propertyId: property.id } });
  if (!r) throw new Error("Reservation not found");
  return r;
}

export async function staffChangeAction(form: FormData) {
  const r = await owned(form);
  await run(`/admin/reservations/${r.id}`, "Reservation updated and re-priced.", async () => {
    await changeReservation(r.id, { siteId: s(form, "siteId"), checkIn: s(form, "checkIn"), checkOut: s(form, "checkOut") });
  });
}

export async function staffCancelAction(form: FormData) {
  const r = await owned(form);
  await run(`/admin/reservations/${r.id}`, "Reservation cancelled.", async () => {
    await cancelReservation(r.id);
    if (n(form, "refund") > 0) await refund(r.id, n(form, "refund"), "Cancellation");
  });
}

export async function setStatusAction(form: FormData) {
  const r = await owned(form);
  const status = s(form, "status");
  await run(s(form, "back") || `/admin/reservations/${r.id}`, status === "CHECKED_IN" ? "Guest checked in." : "Guest checked out.", async () => {
    if (status !== "CHECKED_IN" && status !== "CHECKED_OUT") throw new BookingError("Unknown status.");
    if (r.status === "CANCELLED") throw new BookingError("This reservation is cancelled.");
    await db.reservation.update({ where: { id: r.id }, data: { status } });
  });
}

export async function paymentAction(form: FormData) {
  const r = await owned(form);
  await run(`/admin/reservations/${r.id}`, "Payment recorded.", async () => {
    if (!(n(form, "amount") > 0)) throw new BookingError("Enter an amount greater than zero.");
    await db.payment.create({ data: { reservationId: r.id, amount: n(form, "amount"), method: s(form, "method") || "Cash", note: s(form, "note") } });
  });
}

export async function refundAction(form: FormData) {
  const r = await owned(form);
  await run(`/admin/reservations/${r.id}`, "Refund issued.", async () => {
    await refund(r.id, n(form, "amount"), s(form, "note"));
  });
}

export async function notesAction(form: FormData) {
  const r = await owned(form);
  await db.reservation.update({ where: { id: r.id }, data: { notes: s(form, "notes") } });
  redirect(`/admin/reservations/${r.id}?notice=Notes+saved.`);
}

// ---- Sites and rates ----

function siteData(form: FormData) {
  if (!s(form, "name")) throw new BookingError("A site needs a name or number.");
  if (!(n(form, "lengthFt") > 0)) throw new BookingError("Enter the site length in feet.");
  return {
    name: s(form, "name"),
    siteClassId: s(form, "siteClassId"),
    lengthFt: n(form, "lengthFt"),
    accessType: s(form, "accessType") === "PULL_THROUGH" ? ("PULL_THROUGH" as const) : ("BACK_IN" as const),
    amps: n(form, "amps") || 50,
    hookups: s(form, "hookups") || "Full",
    allowShortTerm: form.has("allowShortTerm"),
    allowLongTerm: form.has("allowLongTerm"),
    active: form.has("active"),
  };
}

export async function saveSiteAction(form: FormData) {
  const { property } = await requireStaff();
  await run("/admin/sites", "Site saved.", async () => {
    const data = siteData(form);
    const clash = await db.site.findFirst({ where: { propertyId: property.id, name: data.name, id: { not: s(form, "id") || "" } } });
    if (clash) throw new BookingError(`There is already a site named ${data.name}.`);
    if (s(form, "id")) await db.site.updateMany({ where: { id: s(form, "id"), propertyId: property.id }, data });
    else await db.site.create({ data: { ...data, propertyId: property.id } });
  });
}

export async function saveClassAction(form: FormData) {
  const { property } = await requireStaff();
  await run(s(form, "back") || "/admin/pricing", "Rates saved.", async () => {
    const data = { name: s(form, "name"), description: s(form, "description"), nightlyRate: n(form, "nightlyRate"), monthlyRate: n(form, "monthlyRate"), minRate: n(form, "minRate"), maxRate: n(form, "maxRate") };
    if (!data.name) throw new BookingError("A site type needs a name.");
    if (!(data.nightlyRate > 0) || !(data.monthlyRate > 0)) throw new BookingError("Enter a nightly and a monthly rate.");
    if (data.minRate > data.nightlyRate || data.maxRate < data.nightlyRate) throw new BookingError("The nightly rate must sit between the floor and the ceiling.");
    if (s(form, "id")) await db.siteClass.updateMany({ where: { id: s(form, "id"), propertyId: property.id }, data });
    else await db.siteClass.create({ data: { ...data, propertyId: property.id, sortOrder: 99 } });
  });
}

export async function savePricingAction(form: FormData) {
  const { property } = await requireStaff();
  await db.property.update({
    where: { id: property.id },
    data: {
      dynamicPricing: form.has("dynamicPricing"),
      weekendUpliftPct: n(form, "weekendUpliftPct"),
      weeklyDiscountPct: n(form, "weeklyDiscountPct"),
      longTermMinNights: Math.max(2, n(form, "longTermMinNights") || 28),
      taxRatePct: n(form, "taxRatePct"),
      taxLongTerm: form.has("taxLongTerm"),
      cancelWindowDays: n(form, "cancelWindowDays"),
    },
  });
  redirect("/admin/pricing?notice=Pricing+settings+saved.");
}

export async function addRuleAction(form: FormData) {
  const { property } = await requireStaff();
  await run("/admin/pricing", "Rule added.", async () => {
    const occ = n(form, "occupancyPct");
    if (occ < 1 || occ > 100) throw new BookingError("Occupancy must be between 1 and 100.");
    await db.pricingRule.create({ data: { propertyId: property.id, occupancyPct: occ, adjustPct: n(form, "adjustPct") } });
  });
}
export async function deleteRuleAction(form: FormData) {
  const { property } = await requireStaff();
  await db.pricingRule.deleteMany({ where: { id: s(form, "id"), propertyId: property.id } });
  redirect("/admin/pricing?notice=Rule+removed.");
}
export async function addSeasonAction(form: FormData) {
  const { property } = await requireStaff();
  await run("/admin/pricing", "Season added.", async () => {
    const a = s(form, "startDate"), b = s(form, "endDate");
    if (!s(form, "name") || !isDateStr(a) || !isDateStr(b) || b < a) throw new BookingError("Give the season a name and a valid date range.");
    await db.season.create({ data: { propertyId: property.id, name: s(form, "name"), startDate: toDate(a), endDate: toDate(b), adjustPct: n(form, "adjustPct") } });
  });
}
export async function deleteSeasonAction(form: FormData) {
  const { property } = await requireStaff();
  await db.season.deleteMany({ where: { id: s(form, "id"), propertyId: property.id } });
  redirect("/admin/pricing?notice=Season+removed.");
}

// ---- Settings ----

export async function createKeyAction(form: FormData) {
  const { user } = await requireStaff();
  const key = await createApiKey(user.organizationId, s(form, "name") || "API key");
  // Shown once on the next page load, then gone.
  (await cookies()).set("new_key", key, { httpOnly: true, maxAge: 30, path: "/admin/settings" });
  redirect("/admin/settings");
}
export async function revokeKeyAction(form: FormData) {
  const { user } = await requireStaff();
  await db.apiKey.deleteMany({ where: { id: s(form, "id"), organizationId: user.organizationId } });
  redirect("/admin/settings?notice=Key+revoked.");
}
