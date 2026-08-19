"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSite } from "./SiteProvider";

export function Footer() {
  const path = usePathname();
  const { content } = useSite();
  if (path.startsWith("/admin")) return null;

  return (
    <footer className="mt-20 border-t border-line bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-3 md:px-6">
        <div>
          <div className="font-display text-2xl">{content.brandName} GHANA</div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{content.footerBlurb}</p>
        </div>
        <div className="text-sm">
          <div className="font-semibold">Operate</div>
          <div className="mt-3 flex flex-col gap-2 text-muted">
            <Link href="/forecast">4-week ensemble forecast</Link>
            <Link href="/intelligence">AI epidemiologist</Link>
            <Link href="/vision">Any-file vision</Link>
            <Link href="/climate">Climate desk</Link>
            <Link href="/extracts">DHIMS2 extracts</Link>
            <Link href="/field">Field brief</Link>
            <Link href="/admin">Admin CMS</Link>
          </div>
        </div>
        <div className="text-sm text-muted">
          <div className="font-semibold text-ink">Partners in scope</div>
          <p className="mt-3 leading-6">{content.partners}</p>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">
        Built for Ghana only · No patient identifiers · Keys stay on the server
      </div>
    </footer>
  );
}
