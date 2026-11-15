import Link from "next/link";
import { notFound } from "next/navigation";
import { brandStyle, fontsHref, getBrand, PRODUCT } from "@/lib/brand";
import { db } from "@/lib/db";

export default async function BookLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const property = await db.property.findUnique({ where: { slug } });
  if (!property) notFound();
  const brand = getBrand(property.brand);
  const fonts = fontsHref(brand);
  // A logo made for dark backgrounds sits on the brand colour; otherwise the header stays white.
  const dark = Boolean(brand.logoOnDark) || !brand.logo;
  const logo = brand.logoOnDark ?? brand.logo;
  return (
    <div className="themed min-h-screen" style={brandStyle(brand)}>
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <header className={dark ? "bg-pine text-on-pine" : "border-b border-line bg-surface text-ink"}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href={`/book/${slug}`} className="font-heading text-xl">
            {logo ? <img src={logo} alt={property.name} className="h-14 w-auto max-w-[60vw] object-contain object-left" /> : property.name}
          </Link>
          <Link href={`/book/${slug}/manage`} className="font-label text-xs tracking-wide uppercase opacity-90 hover:opacity-100">Manage my reservation</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-muted">
        Check-in {property.checkInTime} · Check-out {property.checkOutTime} · Free cancellation up to {property.cancelWindowDays} days before arrival
        <span className="mt-2 block opacity-70">Reservations by {PRODUCT}</span>
      </footer>
    </div>
  );
}
