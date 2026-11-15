import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export default async function BookLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const property = await db.property.findUnique({ where: { slug } });
  if (!property) notFound();
  const logo = (property.brand as { logoOnDark?: string } | null)?.logoOnDark;
  return (
    <div className="min-h-screen">
      <header className="bg-pine">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href={`/book/${slug}`} className="font-heading text-xl text-white">
            {logo ? <img src={logo} alt={property.name} className="h-14 w-auto" /> : property.name}
          </Link>
          <Link href={`/book/${slug}/manage`} className="font-label text-xs tracking-wide text-white/90 uppercase hover:text-white">Manage my reservation</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-muted">
        Check-in {property.checkInTime} · Check-out {property.checkOutTime} · Free cancellation up to {property.cancelWindowDays} days before arrival
      </footer>
    </div>
  );
}
