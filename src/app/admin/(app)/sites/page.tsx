import { Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveSiteAction } from "../../actions";

export default async function Sites({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const [sites, classes] = await Promise.all([
    db.site.findMany({ where: { propertyId: property.id } }),
    db.siteClass.findMany({ where: { propertyId: property.id }, orderBy: { sortOrder: "asc" } }),
  ]);
  sites.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const row = (x: (typeof sites)[number] | null) => {
    const f = x ? `site-${x.id}` : "site-new";
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
        <td className="td"><input form={f} name="lengthFt" type="number" defaultValue={x?.lengthFt} className="input input-sm w-20" aria-label="Length in feet" /></td>
        <td className="td">
          <select form={f} name="accessType" defaultValue={x?.accessType ?? "BACK_IN"} className="input input-sm" aria-label="Access">
            <option value="BACK_IN">Back-in</option><option value="PULL_THROUGH">Pull-through</option>
          </select>
        </td>
        <td className="td">
          <select form={f} name="amps" defaultValue={x?.amps ?? 50} className="input input-sm w-20" aria-label="Amps"><option>50</option><option>30</option><option>20</option></select>
        </td>
        <td className="td"><input form={f} name="hookups" defaultValue={x?.hookups ?? "Full"} className="input input-sm w-36" aria-label="Hookups" /></td>
        <td className="td text-center"><input form={f} type="checkbox" name="allowShortTerm" defaultChecked={x?.allowShortTerm ?? true} aria-label="Short-term" /></td>
        <td className="td text-center"><input form={f} type="checkbox" name="allowLongTerm" defaultChecked={x?.allowLongTerm ?? true} aria-label="Long-term" /></td>
        <td className="td text-center"><input form={f} type="checkbox" name="active" defaultChecked={x?.active ?? true} aria-label="Bookable" /></td>
        <td className="td"><button form={f} className={`btn btn-sm ${x ? "" : "btn-primary"}`}>{x ? "Save" : "Add site"}</button></td>
      </tr>
    );
  };

  return (
    <>
      <h1 className="h1">Sites</h1>
      <p className="mb-4 text-sm text-muted">{sites.filter((x) => x.active).length} bookable sites. Each site can take short-term stays, long-term stays, or both.</p>
      <Flash sp={await searchParams} />
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr>
            <th className="th">Site</th><th className="th">Type</th><th className="th">Length (ft)</th><th className="th">Access</th><th className="th">Amps</th><th className="th">Hookups</th>
            <th className="th text-center">Short-term</th><th className="th text-center">Long-term</th><th className="th text-center">Bookable</th><th className="th" />
          </tr></thead>
          <tbody>{row(null)}{sites.map(row)}</tbody>
        </table>
      </div>
    </>
  );
}
