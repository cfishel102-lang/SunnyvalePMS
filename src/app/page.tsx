import Link from "next/link";
import { redirect } from "next/navigation";
import { PRODUCT } from "@/lib/brand";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// The front door is the customer side. With one property, guests go straight
// to its booking page; with several, they choose a park first.
export default async function Home() {
  const properties = await db.property.findMany({ orderBy: { name: "asc" } });
  if (properties.length === 1) redirect(`/book/${properties[0].slug}`);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-pine uppercase"><i className="h-3 w-3 rounded-full bg-sun" />{PRODUCT}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Book your stay</h1>
      <p className="mt-2 text-muted">{properties.length ? "Choose a park to see availability." : "No parks are set up yet."}</p>
      <div className="mt-6 space-y-3">
        {properties.map((p) => (
          <Link key={p.id} href={`/book/${p.slug}`} className="card flex items-center justify-between p-5 hover:border-pine">
            <span><span className="block font-semibold">{p.name}</span><span className="text-sm text-muted">{p.tagline}</span></span>
            <span className="text-sm font-medium text-pine">Book →</span>
          </Link>
        ))}
      </div>
      <Link href="/admin" className="mt-8 text-sm text-muted underline">Staff sign in</Link>
    </main>
  );
}
