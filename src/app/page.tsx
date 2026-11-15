import Link from "next/link";
import { PRODUCT } from "@/lib/brand";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-pine uppercase"><i className="h-3 w-3 rounded-full bg-sun" />{PRODUCT}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Reservation software for campgrounds and RV parks.</h1>
      <p className="mt-3 text-muted">Upload your park map and brand, set your rates, and take bookings on your own website.</p>
      <div className="mt-8"><Link href="/admin" className="btn btn-primary btn-lg">Staff sign in</Link></div>
    </main>
  );
}
