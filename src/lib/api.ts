// The operations exposed to outside systems. The REST API and the MCP server
// are both thin wrappers around this one list, so they can never drift apart.
import { db } from "./db";
import { isDateStr, toDate, toStr } from "./dates";
import { refund } from "./payments";
import { searchAvailability } from "./pricing";
import { DIMENSIONS, runReport, type Dimension } from "./reports";
import { BookingError, cancelReservation, changeReservation, createReservation, paidTotal } from "./reservations";

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => (a[k] == null ? "" : String(a[k]));

async function property(orgId: string, a: Args) {
  const slug = str(a, "property");
  const p = slug
    ? await db.property.findFirst({ where: { organizationId: orgId, slug } })
    : await db.property.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  if (!p) throw new BookingError(`No property "${slug}" on this account.`);
  return p;
}
function dates(a: Args, x = "check_in", y = "check_out") {
  const from = str(a, x), to = str(a, y);
  if (!isDateStr(from) || !isDateStr(to) || to <= from) throw new BookingError(`${x} and ${y} must be YYYY-MM-DD dates, with ${y} after ${x}.`);
  return [from, to] as const;
}
async function findReservation(orgId: string, code: string) {
  const r = await db.reservation.findFirst({
    where: { code: code.toUpperCase(), property: { organizationId: orgId } },
    include: { guest: true, site: { include: { siteClass: true } }, property: true, payments: true },
  });
  if (!r) throw new BookingError(`No reservation with code ${code}.`);
  return r;
}
type Full = Awaited<ReturnType<typeof findReservation>>;
const view = (r: Full) => ({
  code: r.code,
  property: r.property.slug,
  status: r.status,
  stay_type: r.stayType,
  source: r.source,
  site: r.site.name,
  site_type: r.site.siteClass.name,
  check_in: toStr(r.checkIn),
  check_out: toStr(r.checkOut),
  nights: r.nights,
  guest: { first_name: r.guest.firstName, last_name: r.guest.lastName, email: r.guest.email, phone: r.guest.phone },
  rig_type: r.rigType,
  rig_length_ft: r.rigLengthFt,
  subtotal: Number(r.subtotal),
  tax: Number(r.tax),
  total: Number(r.total),
  paid: paidTotal(r.payments),
  notes: r.notes,
});

const P = { property: { type: "string", description: "Property slug, e.g. rv-at-olympic. Optional if the account has one property." } };
const D = { type: "string", description: "Date as YYYY-MM-DD" };

export const OPERATIONS = {
  list_properties: {
    description: "List the campgrounds on this account.",
    http: ["GET", "/properties"],
    input: {},
    required: [] as string[],
    run: async (orgId: string) =>
      (await db.property.findMany({ where: { organizationId: orgId }, include: { _count: { select: { sites: true } } } })).map((p) => ({ slug: p.slug, name: p.name, timezone: p.timezone, sites: p._count.sites })),
  },
  list_sites: {
    description: "List every site at a property with its length, access type (back-in or pull-through), hookups, and whether it takes short-term and long-term stays.",
    http: ["GET", "/sites"],
    input: { ...P },
    required: [],
    run: async (orgId: string, a: Args) => {
      const p = await property(orgId, a);
      const sites = await db.site.findMany({ where: { propertyId: p.id }, include: { siteClass: true } });
      return sites.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true })).map((s) => ({
        id: s.id, name: s.name, site_type: s.siteClass.name, length_ft: s.lengthFt, access: s.accessType, amps: s.amps, hookups: s.hookups,
        short_term: s.allowShortTerm, long_term: s.allowLongTerm, bookable: s.active,
      }));
    },
  },
  check_availability: {
    description: "Find open sites and the price for a stay. Stays at or above the property's long-term minimum are priced at the monthly rate.",
    http: ["GET", "/availability"],
    input: { ...P, check_in: D, check_out: D, rig_length_ft: { type: "number", description: "Only sites that fit this rig" }, access: { type: "string", enum: ["BACK_IN", "PULL_THROUGH"] } },
    required: ["check_in", "check_out"],
    run: async (orgId: string, a: Args) => {
      const p = await property(orgId, a);
      const [ci, co] = dates(a);
      const acc = str(a, "access");
      const res = await searchAvailability(p.id, ci, co, { rigLengthFt: Number(a.rig_length_ft) || null, accessType: acc === "BACK_IN" || acc === "PULL_THROUGH" ? acc : null });
      return res.map(({ siteClass, sites, quote }) => ({
        site_type: siteClass.name, stay_type: quote.stayType, avg_nightly: quote.avgNightly, subtotal: quote.subtotal, tax: quote.tax, total: quote.total,
        sites: sites.map((s) => ({ id: s.id, name: s.name, length_ft: s.lengthFt, access: s.accessType })),
      }));
    },
  },
  list_reservations: {
    description: "List reservations whose stay overlaps a date range. Optionally filter by status.",
    http: ["GET", "/reservations"],
    input: { ...P, from: D, to: D, status: { type: "string", enum: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"] } },
    required: ["from", "to"],
    run: async (orgId: string, a: Args) => {
      const p = await property(orgId, a);
      const [from, to] = dates(a, "from", "to");
      const st = str(a, "status");
      const rows = await db.reservation.findMany({
        where: { propertyId: p.id, checkIn: { lt: toDate(to) }, checkOut: { gt: toDate(from) }, ...(st ? { status: st as Full["status"] } : {}) },
        include: { guest: true, site: { include: { siteClass: true } }, property: true, payments: true },
        orderBy: { checkIn: "asc" }, take: 500,
      });
      return rows.map(view);
    },
  },
  get_reservation: {
    description: "Look up one reservation by its confirmation code.",
    http: ["GET", "/reservations/{code}"],
    input: { code: { type: "string" } },
    required: ["code"],
    run: async (orgId: string, a: Args) => view(await findReservation(orgId, str(a, "code"))),
  },
  create_reservation: {
    description: "Book a site. Use check_availability first to get a site id. The price is calculated by the system. Payment is not taken; the total shows as a balance due.",
    http: ["POST", "/reservations"],
    input: {
      ...P, site_id: { type: "string" }, check_in: D, check_out: D,
      first_name: { type: "string" }, last_name: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
      rig_type: { type: "string" }, rig_length_ft: { type: "number" }, adults: { type: "number" }, children: { type: "number" }, notes: { type: "string" },
      source: { type: "string", enum: ["API", "EXPEDIA", "BOOKING_COM", "AIRBNB"], description: "Where the booking came from. Defaults to API." },
    },
    required: ["site_id", "check_in", "check_out", "first_name", "last_name", "email"],
    run: async (orgId: string, a: Args) => {
      const p = await property(orgId, a);
      const [ci, co] = dates(a);
      const src = str(a, "source");
      const r = await createReservation({
        propertyId: p.id, siteId: str(a, "site_id"), checkIn: ci, checkOut: co,
        guest: { firstName: str(a, "first_name"), lastName: str(a, "last_name"), email: str(a, "email"), phone: str(a, "phone") },
        rigType: str(a, "rig_type"), rigLengthFt: Number(a.rig_length_ft) || null, adults: Number(a.adults) || 2, children: Number(a.children) || 0, notes: str(a, "notes"),
        source: src === "EXPEDIA" || src === "BOOKING_COM" || src === "AIRBNB" ? src : "API",
      });
      return view(await findReservation(orgId, r.code));
    },
  },
  change_reservation: {
    description: "Move a reservation to new dates and/or a different site. It is re-priced at current rates.",
    http: ["PATCH", "/reservations/{code}"],
    input: { code: { type: "string" }, check_in: D, check_out: D, site_id: { type: "string" } },
    required: ["code"],
    run: async (orgId: string, a: Args) => {
      const r = await findReservation(orgId, str(a, "code"));
      await changeReservation(r.id, { checkIn: str(a, "check_in") || undefined, checkOut: str(a, "check_out") || undefined, siteId: str(a, "site_id") || undefined });
      return view(await findReservation(orgId, r.code));
    },
  },
  cancel_reservation: {
    description: "Cancel a reservation and free the site. Optionally refund an amount, up to what the guest has paid.",
    http: ["DELETE", "/reservations/{code}"],
    input: { code: { type: "string" }, refund_amount: { type: "number", description: "Dollars to refund. Defaults to 0." } },
    required: ["code"],
    run: async (orgId: string, a: Args) => {
      const r = await findReservation(orgId, str(a, "code"));
      await cancelReservation(r.id);
      if (Number(a.refund_amount) > 0) await refund(r.id, Number(a.refund_amount), "Cancelled via API");
      return view(await findReservation(orgId, r.code));
    },
  },
  run_report: {
    description: "Occupancy, revenue, average nightly rate (ADR) and RevPAR for stay nights in a date range (the end date is not included), grouped by a dimension.",
    http: ["GET", "/reports"],
    input: { ...P, from: D, to: D, group_by: { type: "string", enum: Object.keys(DIMENSIONS) } },
    required: ["from", "to"],
    run: async (orgId: string, a: Args) => {
      const p = await property(orgId, a);
      const [from, to] = dates(a, "from", "to");
      const by = str(a, "group_by") || "month";
      if (!(by in DIMENSIONS)) throw new BookingError(`group_by must be one of: ${Object.keys(DIMENSIONS).join(", ")}`);
      return runReport(p.id, from, to, by as Dimension);
    },
  },
} as const;

export type OperationName = keyof typeof OPERATIONS;
export { BookingError };
