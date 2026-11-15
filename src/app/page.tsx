import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const properties = await db.property.findMany({ orderBy: { name: "asc" } });
  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <h1 className="h1">Campground reservations</h1>
      <p className="mt-2 text-muted">Pick a park to book a stay, or sign in to manage reservations.</p>
      <div className="mt-8 space-y-3">
        {properties.map((p) => (
          <Link key={p.id} href={`/book/${p.slug}`} className="card flex items-center justify-between p-5 hover:border-pine">
            <span>
              <span className="block font-semibold">{p.name}</span>
              <span className="text-sm text-muted">{p.tagline}</span>
            </span>
            <span className="text-sm font-medium text-pine">Book a stay →</span>
          </Link>
        ))}
      </div>
      <Link href="/admin" className="mt-8 inline-block text-sm text-muted underline">Staff sign in</Link>
    </main>
  );
}
