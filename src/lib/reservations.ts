import { randomInt } from "crypto";
import type { Source } from "@prisma/client";
import { db } from "./db";
import { isDateStr, nightsBetween, toDate, toStr } from "./dates";
import { availableSites, loadPricingContext, quoteStay } from "./pricing";

/** An error whose message is safe to show to a guest or staff member. */
export class BookingError extends Error {}

export type GuestInput = { firstName: string; lastName: string; email: string; phone?: string };
export type NewReservation = {
  propertyId: string;
  siteId: string;
  checkIn: string;
  checkOut: string;
  guest: GuestInput;
  adults?: number;
  children?: number;
  rigType?: string;
  rigLengthFt?: number | null;
  source: Source;
  notes?: string;
  /** Minutes to hold the site while an online payment is completed. */
  holdMinutes?: number;
};

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

function checkDates(checkIn: string, checkOut: string) {
  if (!isDateStr(checkIn) || !isDateStr(checkOut)) throw new BookingError("Please choose valid arrival and departure dates.");
  if (nightsBetween(checkIn, checkOut) < 1) throw new BookingError("Departure must be after arrival.");
  if (nightsBetween(checkIn, checkOut) > 366) throw new BookingError("Stays are limited to one year per reservation.");
}

async function assertSiteFree(propertyId: string, siteId: string, checkIn: string, checkOut: string, rigLengthFt?: number | null, excludeReservationId?: string) {
  const free = await availableSites(propertyId, checkIn, checkOut, { excludeReservationId });
  const site = free.find((s) => s.id === siteId);
  if (!site) throw new BookingError("That site is no longer available for those dates. Please pick another site or dates.");
  if (rigLengthFt && site.lengthFt < rigLengthFt) throw new BookingError(`Site ${site.name} fits rigs up to ${site.lengthFt} ft.`);
  return site;
}

function friendly(e: unknown): never {
  // The database's own overlap rule is the last line of defence against a
  // race between two people booking the same site at the same moment.
  if (String((e as Error)?.message).includes("Reservation_no_overlap")) {
    throw new BookingError("That site was just booked by someone else. Please pick another site or dates.");
  }
  throw e;
}

export async function createReservation(input: NewReservation) {
  checkDates(input.checkIn, input.checkOut);
  const g = input.guest;
  const email = g.email?.trim().toLowerCase();
  if (!g.firstName?.trim() || !g.lastName?.trim()) throw new BookingError("Please enter the guest's first and last name.");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new BookingError("Please enter a valid email address.");

  const site = await assertSiteFree(input.propertyId, input.siteId, input.checkIn, input.checkOut, input.rigLengthFt);
  const ctx = await loadPricingContext(input.propertyId, input.checkIn, input.checkOut);
  const quote = quoteStay(ctx, site.siteClass, input.checkIn, input.checkOut);

  const guestData = { firstName: g.firstName.trim(), lastName: g.lastName.trim(), phone: g.phone?.trim() ?? "" };
  const guest = await db.guest.upsert({
    where: { organizationId_email: { organizationId: ctx.property.organizationId, email } },
    update: guestData,
    create: { ...guestData, email, organizationId: ctx.property.organizationId },
  });

  try {
    return await db.reservation.create({
      data: {
        code: newCode(),
        propertyId: input.propertyId,
        siteId: site.id,
        guestId: guest.id,
        checkIn: toDate(input.checkIn),
        checkOut: toDate(input.checkOut),
        nights: quote.nights.length,
        stayType: quote.stayType,
        source: input.source,
        adults: input.adults ?? 2,
        children: input.children ?? 0,
        rigType: input.rigType ?? "",
        rigLengthFt: input.rigLengthFt ?? null,
        subtotal: quote.subtotal,
        tax: quote.tax,
        total: quote.total,
        notes: input.notes ?? "",
        holdExpiresAt: input.holdMinutes ? new Date(Date.now() + input.holdMinutes * 60_000) : null,
      },
      include: { site: true, guest: true, property: true },
    });
  } catch (e) {
    friendly(e);
  }
}

/** Move a reservation to new dates and/or a new site, and re-price it. */
export async function changeReservation(id: string, change: { siteId?: string; checkIn?: string; checkOut?: string }) {
  const r = await db.reservation.findUniqueOrThrow({ where: { id } });
  if (r.status === "CANCELLED" || r.status === "CHECKED_OUT") throw new BookingError("This reservation can no longer be changed.");
  const checkIn = change.checkIn ?? toStr(r.checkIn);
  const checkOut = change.checkOut ?? toStr(r.checkOut);
  const siteId = change.siteId ?? r.siteId;
  checkDates(checkIn, checkOut);
  const site = await assertSiteFree(r.propertyId, siteId, checkIn, checkOut, r.rigLengthFt, r.id);
  const ctx = await loadPricingContext(r.propertyId, checkIn, checkOut, r.id);
  const quote = quoteStay(ctx, site.siteClass, checkIn, checkOut);
  try {
    return await db.reservation.update({
      where: { id },
      data: {
        siteId,
        checkIn: toDate(checkIn),
        checkOut: toDate(checkOut),
        nights: quote.nights.length,
        stayType: quote.stayType,
        subtotal: quote.subtotal,
        tax: quote.tax,
        total: quote.total,
      },
      include: { site: true, guest: true, property: true },
    });
  } catch (e) {
    friendly(e);
  }
}

export async function cancelReservation(id: string) {
  const r = await db.reservation.findUniqueOrThrow({ where: { id } });
  if (r.status === "CANCELLED") return r;
  if (r.status === "CHECKED_OUT") throw new BookingError("A completed stay cannot be cancelled.");
  return db.reservation.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), holdExpiresAt: null } });
}

export function paidTotal(payments: { amount: unknown }[]) {
  return Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
}
