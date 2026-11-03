"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/investigations", label: "Investigations" },
];

function NavigationLinks({
  onNavigate,
  mobile = false,
}: {
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={
        mobile ? "flex flex-col gap-1" : "hidden items-center gap-1 sm:flex"
      }
    >
      {navigation.map(({ href, label }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              active
                ? "bg-red-50 text-red-700"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavigationFallback({ mobile = false }: { mobile?: boolean }) {
  return (
    <div
      className={mobile ? "h-10" : "hidden h-10 w-64 sm:block"}
      aria-hidden="true"
    />
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          onClick={() => setMenuOpen(false)}
          className="flex items-center gap-2.5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-sm font-bold text-white">
            H
          </div>

          <div>
            <p className="text-sm font-bold tracking-tight text-zinc-950">
              Hsain Agent
            </p>

            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              Retail Intelligence
            </p>
          </div>
        </Link>

        <Suspense fallback={<NavigationFallback />}>
          <NavigationLinks />
        </Suspense>

        <button
          type="button"
          aria-label={
            menuOpen ? "Close navigation menu" : "Open navigation menu"
          }
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 sm:hidden"
        >
          {menuOpen ? (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-zinc-100 bg-white px-4 py-3 shadow-lg sm:hidden">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<NavigationFallback mobile />}>
              <NavigationLinks mobile onNavigate={() => setMenuOpen(false)} />
            </Suspense>
          </div>
        </div>
      )}
    </header>
  );
}
