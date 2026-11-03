import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "../components/Navbar";
import "./globals.css";
import { Suspense } from "react";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Hsain Agent | Retail Intelligence",
    template: "%s | Hsain Agent",
  },
  description:
    "Evidence-based inventory investigations and human-approved reorder workflows.",
  applicationName: "Hsain Agent",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f8",
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
      <body className="flex min-h-dvh flex-col overflow-x-hidden bg-[#f7f7f8] font-sans text-zinc-900 selection:bg-red-100 selection:text-red-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-zinc-900 focus:shadow-lg"
        >
          Skip to content
        </a>

        <Suspense
          fallback={<div className="h-16 border-b border-zinc-200 bg-white" />}
        >
          <Navbar />
        </Suspense>

        <div className="flex flex-1 flex-col pt-16">
          <main
            id="main-content"
            className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col"
          >
            {children}
          </main>

          <footer className="mt-auto border-t border-zinc-200/80 bg-white">
            <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-center sm:flex-row sm:px-6 sm:text-left lg:px-10">
              <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
                <span className="text-xs font-bold tracking-tight text-zinc-800">
                  Hsain Agent
                </span>

                <span className="hidden text-zinc-300 sm:inline">·</span>

                <span className="text-xs text-zinc-500">
                  Evidence-based inventory intelligence
                </span>
              </div>

              <p className="text-[11px] text-zinc-400">
                Human-approved decisions. Reliable inventory insights.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
