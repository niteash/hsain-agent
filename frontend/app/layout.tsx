import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hsain Agent | Retail Intelligence",
  description:
    "Evidence-based inventory investigations and human-approved reorder workflows.",
  applicationName: "Hsain Agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#f7f7f8]">
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-sm font-bold text-white">
                H
              </div>

              <div>
                <p className="text-sm font-bold tracking-tight text-zinc-950">
                  Hsain Agent
                </p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Retail Intelligence
                </p>
              </div>
            </Link>

            <nav className="flex items-center gap-2 sm:gap-5">
              <Link
                href="/"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                Dashboard
              </Link>

              <Link
                href="/products"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                Products
              </Link>

              <Link
                href="/suppliers"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                Suppliers
              </Link>
            </nav>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-5 text-xs text-zinc-400 sm:px-8 lg:px-10">
            Hsain Agent · Evidence-based inventory intelligence
          </div>
        </footer>
      </body>
    </html>
  );
}
