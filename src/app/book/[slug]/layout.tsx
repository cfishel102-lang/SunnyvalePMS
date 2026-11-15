import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export default async function BookLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const property = await db.property.findUnique({ where: { slug } });
  if (!property) notFound();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href={`/book/${slug}`} className="text-lg font-semibold tracking-tight">{property.name}</Link>
          <Link href={`/book/${slug}/manage`} className="text-sm text-muted hover:text-ink">Manage my reservation</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-muted">
        Check-in {property.checkInTime} · Check-out {property.checkOutTime} · Free cancellation up to {property.cancelWindowDays} days before arrival
      </footer>
    </div>
  );
}
