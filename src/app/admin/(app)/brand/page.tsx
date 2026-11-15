import { Flash } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { brandStyle, fontsHref, FONTS, getBrand, type Brand } from "@/lib/brand";
import { APP_URL } from "@/lib/url";

const COLORS: [keyof Brand["colors"], string, string][] = [
  ["primary", "Main colour", "Headers, navigation and standard buttons"],
  ["accent", "Action colour", "The Reserve and Pay buttons"],
  ["tint", "Background tint", "Page backgrounds and borders, used very lightly"],
  ["highlight", "Highlight", "Notices and badges"],
];
const FONT_ROLES: [keyof Brand["fonts"], string][] = [["heading", "Headings"], ["label", "Small labels"], ["body", "Body text"]];

export default async function BrandPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { property } = await requireStaff();
  const sp = await searchParams;
  const saved = getBrand(property.brand);
  // After a deck upload, show what it suggests (not yet saved) in place of the saved values.
  const fromDeck = Boolean(sp.deck);
  const shown = fromDeck ? getBrand({ ...saved, colors: { ...saved.colors, ...sp }, fonts: { ...saved.fonts, ...sp } }) : saved;
  const fonts = fontsHref(shown);
  const hexes = sp.hexes ? sp.hexes.split(",") : [];
  const embed = `${APP_URL}/embed/${property.slug}`;
  const snippet = `<iframe id="svpms-booking" src="${embed}" title="Book your stay" style="width:100%;border:0;height:230px"></iframe>\n<script>addEventListener("message",function(e){if(e.data&&e.data.svpmsHeight)document.getElementById("svpms-booking").style.height=e.data.svpmsHeight+"px"})</script>`;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="h1">Brand</h1>
        <p className="text-sm text-muted">Your colours, fonts and logo. They style this staff side and the booking pages your guests see.</p>
      </div>
      <Flash sp={sp} />

      <form action="/admin/brand/deck" method="post" encType="multipart/form-data" className="card p-5">
        <h2 className="h2">Start from your brand deck</h2>
        <p className="mt-1 mb-3 text-sm text-muted">Upload your brand guidelines as a PDF. The colour codes and font names in it are picked out for you to check below. Nothing changes until you save.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" name="deck" accept="application/pdf" required className="text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm" />
          <button className="btn">Read brand deck</button>
        </div>
      </form>

      {fromDeck && (
        <div className="rounded-xl bg-amber-soft p-4 text-sm text-amber">
          <p className="font-semibold">Read from {sp.deck}. Check these suggestions, then save.</p>
          <p className="mt-1">
            Colours found: {hexes.length ? hexes.map((h) => <span key={h} className="mr-2 inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full ring-1 ring-black/20" style={{ background: h }} />{h}</span>) : "none"}
            {" · "}Fonts found: {sp.fontsFound?.replace(/,/g, ", ") || "none"}. Logos are not read from the deck; upload them below.
          </p>
        </div>
      )}

      <form action="/admin/brand/save" method="post" encType="multipart/form-data" className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="h2 mb-3">Colours</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {COLORS.map(([k, label, hint]) => (
                <label key={k} className="flex items-center gap-3">
                  <input type="color" name={k} defaultValue={shown.colors[k]} className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1" />
                  <span><span className="block text-sm font-medium">{label} <code className="ml-1 text-xs text-muted">{shown.colors[k]}</code></span><span className="text-xs text-muted">{hint}</span></span>
                </label>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="h2 mb-3">Fonts</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {FONT_ROLES.map(([k, label]) => (
                <div key={k}><label className="label" htmlFor={k}>{label}</label>
                  <select className="input" id={k} name={k} defaultValue={shown.fonts[k]}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="h2 mb-3">Logo</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {([["logo", "For light backgrounds", "bg-surface"], ["logoOnDark", "For dark backgrounds (optional)", "bg-pine"]] as const).map(([k, label, bg]) => (
                <div key={k}>
                  <p className="label">{label}</p>
                  <div className={`mb-2 flex h-24 items-center justify-center rounded-lg border border-line ${bg}`}>
                    {saved[k] ? <img src={saved[k]} alt="" className="h-20 w-auto max-w-[80%] object-contain" /> : <span className={`text-xs ${k === "logo" ? "text-muted" : "text-on-pine opacity-70"}`}>None</span>}
                  </div>
                  <input type="file" name={k} accept="image/png,image/svg+xml,image/webp,image/jpeg" className="block w-full text-xs file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-line file:bg-surface file:px-2 file:py-1" />
                  {saved[k] && <label className="mt-1 flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name={`remove.${k}`} /> Remove this logo</label>}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">PNG or SVG with a transparent background works best. With a dark-background logo, the booking page header uses your main colour.</p>
          </div>
          <button className="btn btn-primary btn-lg">Save brand</button>
        </div>

        {/* A sample of the look being edited. */}
        <aside className="themed h-fit overflow-hidden rounded-xl border border-line" style={brandStyle(shown)}>
          {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
          <div className="bg-pine px-4 py-3 font-heading text-lg text-on-pine">{property.name}</div>
          <div className="space-y-3 p-4">
            <p className="font-label text-[11px] tracking-widest text-dusk uppercase">Reserve your stay</p>
            <p className="font-heading text-2xl font-medium">Heading example</p>
            <p className="text-sm text-muted">Body text looks like this on your booking pages and in the staff screens.</p>
            <div className="card p-3">
              <p className="label">Arrive</p>
              <p className="text-sm">Fri, Jun 12</p>
              <p className="mt-2 flex gap-1.5"><span className="badge bg-pine-soft text-pine-dark">Back-in</span><span className="badge bg-amber-soft text-amber">Only 2 left</span></p>
            </div>
            <div className="flex gap-2"><span className="btn btn-cta">Reserve</span><span className="btn btn-primary">Save</span><span className="btn">Cancel</span></div>
            <p className="text-[11px] text-muted">{fromDeck ? "Preview of the suggestions. Save to apply." : "Preview of your saved brand."}</p>
          </div>
        </aside>
      </form>

      <div className="card p-5">
        <h2 className="h2">Put booking on your own website</h2>
        <p className="mt-1 text-sm text-muted">Your booking pages wear your brand, so they sit naturally next to your existing site. Two ways to connect them:</p>
        <p className="mt-4 text-sm font-medium">1. A "Book now" button or menu link pointing to</p>
        <code className="mt-1 block rounded-lg bg-paper px-3 py-2 text-xs break-all">{APP_URL}/book/{property.slug}</code>
        <p className="mt-4 text-sm font-medium">2. A date picker on any page of your site. Paste this where it should appear:</p>
        <pre className="mt-1 overflow-x-auto rounded-lg bg-paper px-3 py-2 text-xs whitespace-pre-wrap break-all">{snippet}</pre>
        <p className="mt-3 text-xs text-muted">Guests choose dates on your site, then finish booking and paying on a full page. <a className="underline" href={embed} target="_blank">Preview the date picker</a></p>
      </div>
    </div>
  );
}
