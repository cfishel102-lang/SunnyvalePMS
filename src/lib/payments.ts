import Stripe from "stripe";
import { db } from "./db";
import { paidTotal, BookingError } from "./reservations";
import { round2 } from "./format";

const key = process.env.STRIPE_SECRET_KEY;
export const stripe = key ? new Stripe(key) : null;
export const paymentsLive = Boolean(stripe);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Take payment for a new online booking and return the URL to send the guest to.
 * With a Stripe key: Stripe's hosted checkout page (card details never touch this app).
 * Without one: demo mode, which records a pretend payment so the flow can be tested.
 */
export async function startCheckout(reservationId: string): Promise<string> {
  const r = await db.reservation.findUniqueOrThrow({ where: { id: reservationId }, include: { property: true, site: true, guest: true } });
  const done = `${APP_URL}/book/${r.property.slug}/confirmation/${r.code}`;
  if (!stripe) {
    await db.payment.create({ data: { reservationId: r.id, amount: r.total, method: "Demo card", note: "Demo mode: no real charge" } });
    await db.reservation.update({ where: { id: r.id }, data: { holdExpiresAt: null } });
    return done;
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: r.guest.email,
    client_reference_id: r.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(r.total) * 100),
          product_data: { name: `${r.property.name}: Site ${r.site.name}, ${r.nights} night${r.nights === 1 ? "" : "s"}`, description: `Confirmation ${r.code}` },
        },
      },
    ],
    success_url: `${done}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/book/${r.property.slug}`,
  });
  return session.url!;
}

/** Called when the guest returns from Stripe: verify the payment with Stripe and record it once. */
export async function confirmCheckout(sessionId: string) {
  if (!stripe) return;
  const s = await stripe.checkout.sessions.retrieve(sessionId);
  if (s.payment_status !== "paid" || !s.client_reference_id || !s.payment_intent) return;
  const stripeId = String(s.payment_intent);
  if (await db.payment.findUnique({ where: { stripeId } })) return;
  await db.payment.create({ data: { reservationId: s.client_reference_id, amount: (s.amount_total ?? 0) / 100, method: "Card", stripeId } });
  await db.reservation.update({ where: { id: s.client_reference_id }, data: { holdExpiresAt: null } });
}

/** Refund up to what has been paid. Card payments go back through Stripe. */
export async function refund(reservationId: string, amount: number, note = "") {
  const payments = await db.payment.findMany({ where: { reservationId }, orderBy: { createdAt: "asc" } });
  amount = round2(amount);
  if (!(amount > 0)) throw new BookingError("Enter a refund amount greater than zero.");
  if (amount > paidTotal(payments)) throw new BookingError("The refund is more than the guest has paid.");
  const card = payments.find((p) => p.stripeId?.startsWith("pi_") && Number(p.amount) >= amount);
  let stripeId: string | null = null;
  if (stripe && card) {
    const re = await stripe.refunds.create({ payment_intent: card.stripeId!, amount: Math.round(amount * 100) });
    stripeId = re.id;
  }
  return db.payment.create({ data: { reservationId, amount: -amount, method: stripeId ? "Card refund" : "Refund", stripeId, note } });
}
