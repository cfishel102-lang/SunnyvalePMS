import { notFound } from "next/navigation";
import { brandStyle, fontsHref, getBrand } from "@/lib/brand";
import { addDays, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { APP_URL } from "@/lib/url";

// A compact date picker for a property's own website (shown inside a frame).
// Submitting it opens the full booking page in the whole browser tab.
const REPORT_HEIGHT = `
  function send(){ parent.postMessage({ svpmsHeight: Math.ceil(document.getElementById("svpms").getBoundingClientRect().height) }, "*"); }
  addEventListener("load", send); addEventListener("resize", send);
`;

export default async function Embed({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const property = await db.property.findUnique({ where: { slug } });
  if (!property) notFound();
  const brand = getBrand(property.brand);
  const fonts = fontsHref(brand);
  const now = today(property.timezone);
  return (
    <div style={{ ...brandStyle(brand), fontFamily: "var(--font-sans)", color: "var(--color-ink)" }} className="p-1" id="svpms">
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <style>{`html, body { background: transparent !important; }`}</style>
      <form action={`${APP_URL}/book/${slug}`} target="_top" className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div><label className="label" htmlFor="checkIn">Arrive</label><input className="input" type="date" id="checkIn" name="checkIn" required min={now} defaultValue={addDays(now, 1)} /></div>
        <div><label className="label" htmlFor="checkOut">Depart</label><input className="input" type="date" id="checkOut" name="checkOut" required min={addDays(now, 1)} defaultValue={addDays(now, 3)} /></div>
        <div className="col-span-2 sm:col-span-1"><label className="label" htmlFor="rig">RV length (ft)</label><input className="input" type="number" id="rig" name="rig" min={0} max={100} placeholder="e.g. 36" /></div>
        <button className="btn btn-cta col-span-2 sm:col-span-1">Check availability</button>
      </form>
      <script dangerouslySetInnerHTML={{ __html: REPORT_HEIGHT }} />
    </div>
  );
}
