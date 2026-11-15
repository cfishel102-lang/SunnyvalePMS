import type { Metadata } from "next";
import { Montserrat, Nunito_Sans, Oswald } from "next/font/google";
import "./globals.css";

const body = Nunito_Sans({ variable: "--font-body", subsets: ["latin"] });
const heading = Oswald({ variable: "--font-heading", subsets: ["latin"], weight: ["500"] });
const label = Montserrat({ variable: "--font-label", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Campground reservations",
  description: "Simple reservation software for RV parks and campgrounds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${label.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
