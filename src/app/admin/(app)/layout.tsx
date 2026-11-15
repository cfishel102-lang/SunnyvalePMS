import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { brandStyle, fontsHref, getBrand, PRODUCT } from "@/lib/brand";
import { logoutAction } from "../actions";

const NAV = [
  ["/admin", "Dashboard"],
  ["/admin/calendar", "Calendar"],
  ["/admin/reservations", "Reservations"],
  ["/admin/sites", "Sites"],
  ["/admin/map", "Map"],
  ["/admin/pricing", "Pricing"],
  ["/admin/reports", "Reports"],
  ["/admin/brand", "Brand"],
  ["/admin/settings", "Settings"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, property } = await requireStaff();
  const brand = getBrand(property.brand);
  const logo = brand.logo;
  const fonts = fontsHref(brand);
  return (
    <div className="themed min-h-screen md:flex" style={brandStyle(brand)}>
      {fonts && <link rel="stylesheet" href={fonts} precedence="default" />}
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-52 md:shrink-0 md:border-r md:border-b-0">
        <div className="px-5 pt-5 pb-3">
          {logo ? <img src={logo} alt={property.name} className="mb-1 h-16 w-auto max-w-full object-contain object-left" /> : <p className="font-heading text-lg">{property.name}</p>}
          <p className="text-xs text-muted">{user.organization.name}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-0.5">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-lg px-3 py-1.5 text-sm whitespace-nowrap text-ink/80 hover:bg-paper hover:text-ink">{label}</Link>
          ))}
        </nav>
        <div className="hidden px-3 md:absolute md:bottom-4 md:block md:w-full">
          <Link href="/admin/reservations/new" className="btn btn-primary w-full">+ New reservation</Link>
          <Link href={`/book/${property.slug}`} target="_blank" className="mt-3 block px-2 text-xs text-muted hover:text-ink">View booking page ↗</Link>
          <form action={logoutAction}><button className="mt-1 cursor-pointer px-2 text-xs text-muted hover:text-ink">Sign out</button></form>
          <p className="mt-3 border-t border-line px-2 pt-2 text-[10px] tracking-wide text-muted uppercase">{PRODUCT}</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
