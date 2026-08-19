"use client";

import { useSite } from "./SiteProvider";

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  const { content } = useSite();
  return (
    <div className="rounded-2xl border border-gold-soft bg-gold-soft/70 px-4 py-3 text-sm leading-6 text-ink">
      <span className="font-semibold">Scientific limit. </span>
      {compact ? "A forecast is a range, never certainty. An alert is not a confirmed outbreak." : content.disclaimer}
    </div>
  );
}
