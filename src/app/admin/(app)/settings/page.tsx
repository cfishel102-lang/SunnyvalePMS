import { cookies } from "next/headers";
import { Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/dates";
import { SOURCE_LABEL } from "@/lib/format";
import { paymentsLive } from "@/lib/payments";
import { createKeyAction, revokeKeyAction } from "../../actions";

const Pill = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
  <span className={`badge ${on ? "bg-pine-soft text-pine-dark" : "bg-amber-soft text-amber"}`}>{children}</span>
);

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, property } = await requireStaff();
  const newKey = (await cookies()).get("new_key")?.value;
  const [keys, channels] = await Promise.all([
    db.apiKey.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
    db.channel.findMany({ where: { propertyId: property.id }, orderBy: { source: "asc" } }),
  ]);
  const base = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="h1">Settings</h1>
      <Flash sp={await searchParams} />

      <div className="card p-5">
        <div className="flex items-center justify-between"><h2 className="h2">Card payments (Stripe)</h2><Pill on={paymentsLive}>{paymentsLive ? "Connected" : "Demo mode"}</Pill></div>
        <p className="mt-1 text-sm text-muted">
          {paymentsLive
            ? "Online bookings are paid on Stripe's secure checkout page, and refunds go back to the guest's card."
            : "No Stripe key is set, so online bookings record a pretend payment and no card is charged. Add your Stripe secret key to switch on real payments."}
        </p>
      </div>

      <div className="card p-5">
        <h2 className="h2">Open API and MCP</h2>
        <p className="mt-1 text-sm text-muted">Anything staff can do here, another system or an AI assistant can do with a key: check availability, create, change and cancel reservations, and pull reports.</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-3"><dt className="w-28 text-muted">REST API</dt><dd><code>{base}/api/v1</code> · <a className="underline" href="/api/v1/openapi.json" target="_blank">API description</a></dd></div>
          <div className="flex gap-3"><dt className="w-28 text-muted">MCP server</dt><dd><code>{base}/api/mcp</code></dd></div>
        </dl>
        {newKey && (
          <div className="mt-4 rounded-lg bg-pine-soft p-4 text-sm">
            <p className="font-medium text-pine-dark">Your new key. Copy it now: it won't be shown again.</p>
            <code className="mt-1 block break-all">{newKey}</code>
          </div>
        )}
        <ul className="mt-4 text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between border-t border-line py-2">
              <span>{k.name} <code className="ml-2 text-xs text-muted">{k.prefix}…</code></span>
              <span className="flex items-center gap-4 text-xs text-muted">
                {k.lastUsedAt ? `Last used ${fmtDate(k.lastUsedAt)}` : "Never used"}
                <form action={revokeKeyAction}><input type="hidden" name="id" value={k.id} /><button className="cursor-pointer hover:text-danger">Revoke</button></form>
              </span>
            </li>
          ))}
        </ul>
        <form action={createKeyAction} className="mt-3 flex gap-2">
          <input className="input w-64" name="name" placeholder="What is this key for?" required />
          <button className="btn">Create key</button>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="h2">Booking channels</h2>
        <p className="mt-1 text-sm text-muted">Reservations from each channel are tracked separately in reports. Live two-way connections are not built yet.</p>
        <ul className="mt-3 text-sm">
          {channels.map((c) => (
            <li key={c.id} className="flex items-center justify-between border-t border-line py-2.5">
              <span className="font-medium">{SOURCE_LABEL[c.source]}</span>
              <Pill on={c.enabled}>{c.enabled ? "Connected" : "Not connected"}</Pill>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between"><h2 className="h2">Google (Analytics and Ads)</h2><Pill on={false}>Not connected</Pill></div>
        <p className="mt-1 text-sm text-muted">Planned: bring in website visits and ad spend so reports can show conversion rate and marketing cost next to occupancy and rate.</p>
      </div>
    </div>
  );
}
