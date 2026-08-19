"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/forecast", label: "Forecast" },
  { href: "/surveillance", label: "Surveillance" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/vision", label: "Vision Lab" },
  { href: "/regions", label: "Regions" },
  { href: "/workbook", label: "Workbook" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50">
      <div className="flag-bar h-1 w-full" />
      <div className="glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logo.png" alt="ONE HEALTH GHANA" className="h-10 w-10 rounded-xl object-cover ring-1 ring-line" />
            <div className="leading-tight">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ghana-green">Ghana Health Service</div>
              <div className="font-display text-lg tracking-tight">ONE HEALTH</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => {
              const active = path === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <button className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="border-t border-line px-4 py-3 lg:hidden">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 text-sm">
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
