import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// The built-in SunnyvalePMS font. A property's own brand fonts are loaded by its pages.
const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SunnyvalePMS",
  description: "Simple reservation software for RV parks and campgrounds.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
