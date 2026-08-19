export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-gold-soft bg-gold-soft/70 px-4 py-3 text-sm leading-6 text-ink">
      <span className="font-semibold">Scientific limit. </span>
      {compact
        ? "A forecast is a range, never certainty. An alert is not a confirmed outbreak."
        : "This platform cannot produce an error-free future. Every number is a model statement with an interval. Reporting delays, testing changes, and missing weeks bias the history. Field epidemiology remains mandatory."}
    </div>
  );
}
