// Stays are whole calendar days. We pass them around as "YYYY-MM-DD" strings
// and only turn them into Date objects (at UTC midnight) at the database edge.

export const DAY = 86_400_000;

export function toDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}
export function toStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function isDateStr(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toDate(s).getTime());
}
export function addDays(s: string, n: number): string {
  return toStr(new Date(toDate(s).getTime() + n * DAY));
}
export function nightsBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}
export function eachNight(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) out.push(d);
  return out;
}
export function today(timezone = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}
export function fmtDate(s: string | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  const d = typeof s === "string" ? toDate(s) : s;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(d);
}
export function fmtShort(s: string | Date): string {
  return fmtDate(s, { weekday: "short", month: "short", day: "numeric" });
}
export function startOfMonth(s: string): string {
  return s.slice(0, 8) + "01";
}
