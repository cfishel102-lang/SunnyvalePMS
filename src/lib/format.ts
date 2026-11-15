export function money(n: number | string | { toString(): string }, cents = true): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(Number(n));
}
export function pct(n: number, digits = 0): string {
  return (isFinite(n) ? n * 100 : 0).toFixed(digits) + "%";
}
export const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: "Website",
  STAFF: "Front desk",
  API: "API",
  EXPEDIA: "Expedia",
  BOOKING_COM: "Booking.com",
  AIRBNB: "Airbnb",
};
export const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  CANCELLED: "Cancelled",
};
export const ACCESS_LABEL: Record<string, string> = { BACK_IN: "Back-in", PULL_THROUGH: "Pull-through" };
export const round2 = (n: number) => Math.round(n * 100) / 100;
