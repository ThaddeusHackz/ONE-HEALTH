import Link from "next/link";
import { REGIONS } from "@/lib/ghana";
import { districtsFor, DISTRICTS } from "@/lib/districts";

export const metadata = { title: "Regions" };

export default function RegionsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">Geographic unit</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Sixteen regions, Ghana only</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Population figures are census-scale references for rate thinking, not a live DHIMS2 extract. {DISTRICTS.length} representative MMDAs sit under the 16 regions — not all 261, because small-cell counts re-identify. Completeness is “every region has districts,” not “every MMDA is listed.”
      </p>
      <img src="/images/ghana-regions.png" alt="Ghana regions" className="mt-8 w-full rounded-[28px] border border-line bg-white shadow-card" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REGIONS.map((r) => (
          <Link key={r.id} href={`/forecast?region=${r.id}`} className="rounded-3xl border border-line bg-white p-5 shadow-card">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-teal">{r.zone} belt</div>
            <div className="font-display mt-1 text-2xl">{r.name}</div>
            <p className="mt-2 text-sm text-muted">
              Capital {r.capital} · {(r.population / 1e6).toFixed(2)}M · {r.facilities} facilities
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
