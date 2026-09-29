"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export const NAV_LINKS = [
  { href: "/", label: "Solver" },
  { href: "/calculator", label: "Kalkulator" },
  { href: "/grafik", label: "Grafik" },
  { href: "/verifikasi", label: "Cek Pekerjaan" },
  { href: "/riwayat", label: "Riwayat" },
  { href: "/tentang", label: "Metodologi" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    // Close the mobile menu after navigation.
    setLastPath(pathname);
    setOpen(false);
  }
  return (
    <>
      <nav aria-label="Navigasi utama" className="hidden md:block">
        <ul className="flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-strong"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted md:hidden"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
      </button>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Navigasi utama (seluler)"
          className="absolute inset-x-0 top-full z-40 border-b border-border bg-surface shadow-lg md:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col p-2">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(pathname, l.href) ? "page" : undefined}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-text hover:bg-surface-2 aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-strong"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
