import Link from "next/link";
import { Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { bulkLengthAction, saveSiteAction } from "../../actions";

export default async function Sites({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const [sites, classes] = await Promise.all([
    db.site.findMany({ where: { propertyId: property.id } }),
    db.siteClass.findMany({ where: { propertyId: property.id }, orderBy: { sortOrder: "asc" } }),
  ]);
  sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const noLength = sites.filter((x) => x.active && !x.lengthFt).length;

  const row = (x: (typeof sites)[number] | null) => {
    const f = x ? `site-${x.id}` : "site-new";
    const box = (name: "allowShortTerm" | "allowLongTerm" | "accessible" | "active", label: string, fallback: boolean) => (
      <td className="td text-center"><input form={f} type="checkbox" name={name} defaultChecked={x ? x[name] : fallback} aria-label={label} /></td>
    );
    return (
      <tr key={f} className={x && !x.active ? "opacity-50" : ""}>
        <td className="td">
          <form id={f} action={saveSiteAction}>{x && <input type="hidden" name="id" value={x.id} />}</form>
          <input form={f} name="name" defaultValue={x?.name} placeholder="New" className="input input-sm w-16" aria-label="Site name" />
        </td>
        <td className="td">
          <select form={f} name="siteClassId" defaultValue={x?.siteClassId} className="input input-sm" aria-label="Site type">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </td>
        <td className="td"><input form={f} name="lengthFt" type="number" defaultValue={x?.lengthFt ?? ""} placeholder="—" className="input input-sm w-20" aria-label="Length in feet" /></td>
        <td className="td">
          <select form={f} name="accessType" defaultValue={x?.accessType ?? "BACK_IN"} className="input input-sm" aria-label="Access">
            <option value="BACK_IN">Back-in</option><option value="PULL_THROUGH">Pull-through</option>
          </select>
        </td>
        <td className="td">
          <select form={f} name="amps" defaultValue={x?.amps ?? 50} className="input input-sm w-20" aria-label="Amps"><option>50</option><option>30</option><option>20</option></select>
        </td>
        <td className="td"><input form={f} name="hookups" defaultValue={x?.hookups ?? "Full"} className="input input-sm w-28" aria-label="Hookups" /></td>
        {box("accessible", "Accessible", false)}{box("allowShortTerm", "Short-term", true)}{box("allowLongTerm", "Long-term", true)}{box("active", "Bookable", true)}
        <td className="td"><button form={f} className={`btn btn-sm ${x ? "" : "btn-primary"}`}>{x ? "Save" : "Add site"}</button></td>
      </tr>
    );
  };

  return (
    <>
      <div className="flex items-end justify-between">
        <h1 className="h1">Sites</h1>
        <Link href="/admin/map" className="btn btn-sm">View on map</Link>
      </div>
      <p className="mb-4 text-sm text-muted">{sites.filter((x) => x.active).length} bookable sites of {sites.length}. Each site can take short-term stays, long-term stays, or both.</p>
      <Flash sp={await searchParams} />

      {noLength > 0 && (
        <p className="mb-4 rounded-lg bg-amber-soft px-4 py-3 text-sm text-amber">
          <b>{noLength} bookable sites have no length.</b> Until a length is entered, guests with any size of RV can book them.
        </p>
      )}
      <form action={bulkLengthAction} className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="mr-2"><h2 className="h2">Set a length for a whole site type</h2><p className="text-xs text-muted">Fills in sites that have no length yet.</p></div>
        <div><label className="label" htmlFor="bulkClass">Site type</label>
          <select className="input" id="bulkClass" name="siteClassId">{classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({sites.filter((x) => x.siteClassId === c.id).length})</option>)}</select>
        </div>
        <div><label className="label" htmlFor="bulkLen">Length (ft)</label><input className="input w-24" id="bulkLen" name="lengthFt" type="number" min={1} required /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="overwrite" /> Also replace lengths already entered</label>
        <button className="btn">Apply</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th">Site</th><th className="th">Type</th><th className="th">Length (ft)</th><th className="th">Access</th><th className="th">Amps</th><th className="th">Hookups</th>
            <th className="th text-center">Accessible</th><th className="th text-center">Short-term</th><th className="th text-center">Long-term</th><th className="th text-center">Bookable</th><th className="th" />
          </tr></thead>
          <tbody>{row(null)}{sites.map(row)}</tbody>
        </table>
      </div>
    </>
  );
}
