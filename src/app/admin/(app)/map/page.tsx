import { Flash } from "@/components/ui";
import { SiteMap, type Pin } from "@/components/SiteMap";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, toDate, today } from "@/lib/dates";
import { MapAnalysisSchema, mapReadingAvailable } from "@/lib/mapImport";
import { applyMapAction, readMapAction } from "../../actions";

const Upload = ({ label }: { label: string }) => (
  <form action="/admin/map/upload" method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-3">
    <input type="file" name="map" accept="image/jpeg,image/png,image/webp" required className="text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm" />
    <button className="btn btn-primary">{label}</button>
  </form>
);

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const sp = await searchParams;
  const map = await db.propertyMap.findUnique({ where: { propertyId: property.id }, select: { analysis: true, appliedAt: true, createdAt: true } });
  const src = `/api/map/${property.slug}?v=${map?.createdAt.getTime()}`;
  const parsed = MapAnalysisSchema.safeParse(map?.analysis);
  const analysis = parsed.success ? parsed.data : null;
  const head = (
    <>
      <h1 className="h1">Park map</h1>
      <Flash sp={sp} />
    </>
  );

  // Step 1: no map yet.
  if (!map) {
    return (
      <div className="max-w-3xl">
        {head}
        <div className="card p-6">
          <h2 className="h2">Start by uploading your park map</h2>
          <p className="mt-1 mb-4 text-sm text-muted">The system reads the site numbers and the colour key, and proposes your site list. You review it before anything is created.</p>
          <Upload label="Upload map" />
        </div>
      </div>
    );
  }

  // Step 2: map uploaded but not read.
  if (!analysis) {
    return (
      <div className="max-w-5xl">
        {head}
        <div className="card mb-4 p-5">
          <h2 className="h2">Read the sites from this map</h2>
          {mapReadingAvailable ? (
            <form action={readMapAction} className="mt-2"><button className="btn btn-primary">Read map</button><span className="ml-3 text-sm text-muted">Takes a minute or two.</span></form>
          ) : (
            <p className="mt-1 text-sm text-amber">Automatic map reading is switched off because no Anthropic API key is set. Add ANTHROPIC_API_KEY to turn it on.</p>
          )}
        </div>
        <SiteMap src={src} alt="Park map" pins={[]} />
      </div>
    );
  }

  // Step 3: review what was read, then import.
  if (!map.appliedAt) {
    const existing = await db.siteClass.findMany({ where: { propertyId: property.id } });
    return (
      <div className="max-w-6xl">
        {head}
        <p className="mb-4 text-sm text-muted">
          Found <b className="text-ink">{analysis.sites.length} sites</b> in {analysis.siteTypes.length} types. Check the markers sit on the right site numbers, set your rates, then import.
        </p>
        {analysis.notes.length > 0 && (
          <div className="mb-4 rounded-xl bg-amber-soft p-4 text-sm text-amber">
            <p className="font-semibold">Please check</p>
            <ul className="mt-1 list-disc pl-5">{analysis.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        <SiteMap src={src} alt="Park map" pins={analysis.sites.map((s) => ({ name: s.name, x: s.x, y: s.y, color: analysis.siteTypes.find((t) => t.key === s.type)?.color ?? "#636F56", title: `Site ${s.name}` }))} />
        <form action={applyMapAction} className="card mt-4 overflow-x-auto p-5">
          <h2 className="h2">Site types from the map key</h2>
          <p className="mb-3 text-xs text-muted">Rates and lengths are not on the map, so enter them here. Leave length blank to fill in per site later. Untick Bookable for anything guests should not be able to reserve.</p>
          <table className="w-full">
            <thead><tr>
              <th className="th">Type</th><th className="th num">Sites</th><th className="th">Hookups</th><th className="th">Nightly ($)</th><th className="th">Floor ($)</th><th className="th">Ceiling ($)</th><th className="th">Monthly ($)</th><th className="th">Length (ft)</th><th className="th text-center">Bookable</th>
            </tr></thead>
            <tbody>
              {analysis.siteTypes.map((t) => {
                const was = existing.find((c) => c.name === t.name);
                const sites = analysis.sites.filter((s) => s.type === t.key);
                const num = (k: "nightlyRate" | "minRate" | "maxRate" | "monthlyRate") => (
                  <td className="td"><input name={`${t.key}.${k}`} type="number" min={0} defaultValue={was && Number(was[k]) ? Number(was[k]) : ""} className="input input-sm w-24" aria-label={k} /></td>
                );
                return (
                  <tr key={t.key}>
                    <td className="td"><span className="flex items-center gap-2"><i className="h-4 w-4 shrink-0 rounded" style={{ background: t.color }} /><input name={`${t.key}.name`} defaultValue={t.name} className="input input-sm w-52" aria-label="Type name" /></span></td>
                    <td className="td num">{sites.length}</td>
                    <td className="td text-muted">{t.hookups}, {t.amps} amp</td>
                    {num("nightlyRate")}{num("minRate")}{num("maxRate")}{num("monthlyRate")}
                    <td className="td"><input name={`${t.key}.lengthFt`} type="number" min={0} className="input input-sm w-20" aria-label="Length" /></td>
                    <td className="td text-center"><input type="checkbox" name={`${t.key}.bookable`} defaultChecked={!was || Number(was.nightlyRate) > 0} aria-label="Bookable" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="btn btn-primary mt-4">Import {analysis.sites.length} sites</button>
          <span className="ml-3 text-xs text-muted">Sites already in the system keep their reservations. Sites that are not on the map are switched off.</span>
        </form>
      </div>
    );
  }

  // Live map: what is happening on each site today.
  const now = today(property.timezone);
  const d = toDate(now);
  const sites = await db.site.findMany({
    where: { propertyId: property.id, mapX: { not: null } },
    include: { reservations: { where: { status: { in: ["CONFIRMED", "CHECKED_IN"] }, checkIn: { lte: d }, checkOut: { gt: d } }, include: { guest: true } } },
  });
  const KEY = { free: ["#ffffff", "Open tonight"], arriving: ["#E3D370", "Arriving today"], occupied: ["#A36334", "Occupied"], off: ["#9a9a8e", "Not bookable"] } as const;
  const pins: Pin[] = sites.map((s) => {
    const r = s.reservations[0];
    const state = !s.active ? "off" : !r ? "free" : r.status === "CONFIRMED" ? "arriving" : "occupied";
    return {
      name: s.name, x: s.mapX!, y: s.mapY!, color: KEY[state][0], text: state === "occupied" || state === "off" ? "#fff" : "#262b20",
      title: r ? `Site ${s.name}: ${r.guest.firstName} ${r.guest.lastName}` : `Site ${s.name}: ${KEY[state][1].toLowerCase()}`,
      href: r ? `/admin/reservations/${r.id}` : s.active ? `/admin/reservations/new?checkIn=${now}&checkOut=${addDays(now, 1)}&site=${s.id}` : undefined,
    };
  });
  const count = (c: string) => pins.filter((p) => p.color === c).length;

  return (
    <div className="max-w-6xl">
      {head}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
        {Object.values(KEY).map(([c, label]) => (
          <span key={label} className="flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-full ring-1 ring-ink/30" style={{ background: c }} />{label} <b>{count(c)}</b></span>
        ))}
        <span className="ml-auto text-xs text-muted">Click a site to open its guest, or to book it.</span>
      </div>
      <SiteMap src={src} alt="Park map" pins={pins} />
      <details className="card mt-4 p-5">
        <summary className="cursor-pointer font-semibold">Replace the map</summary>
        <p className="mt-2 mb-3 text-sm text-muted">Upload a new map if the park layout changes. You will review the sites again before anything is updated.</p>
        <Upload label="Upload new map" />
      </details>
    </div>
  );
}
