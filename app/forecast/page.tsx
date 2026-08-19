"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DISEASES, REGIONS } from "@/lib/ghana";
import { districtsFor } from "@/lib/districts";
import { Disclaimer } from "@/components/Disclaimer";
import { KeyStatus } from "@/components/KeyStatus";
import type { ForecastBundle } from "@/lib/forecast";

function ForecastInner() {
  const params = useSearchParams();
  const [diseaseId, setDiseaseId] = useState(params.get("disease") || "malaria");
  const [regionId, setRegionId] = useState(params.get("region") || "national");
  const [districtId, setDistrictId] = useState(params.get("district") || "");
  const [horizon, setHorizon] = useState(4);
  const [data, setData] = useState<(ForecastBundle & { briefing?: string; briefingModel?: string; nowcast?: { current: { observed: number; nowcast: number; low: number; high: number; completeness: number }; caveat: string } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState(false);
  const [err, setErr] = useState("");
  const [seriesNote, setSeriesNote] = useState("");
  const localDistricts = districtsFor(regionId);

  async function load(brief = false) {
    if (brief) setBriefing(true);
    else setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diseaseId, regionId, districtId: districtId || undefined, horizon, brief }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Forecast failed");
      setData(json);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
      setBriefing(false);
    }
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diseaseId, regionId, districtId, horizon]);

  const chart = useMemo(() => {
    if (!data) return [];
    const hist = data.series.slice(-80).map((s) => ({
      date: s.date.slice(5),
      observed: s.cases,
    }));
    const last = hist[hist.length - 1];
    const future = data.ensemble.points.map((p) => ({
      date: p.date.slice(5),
      ensemble: Math.round(p.point),
      low: Math.round(p.low),
      high: Math.round(p.high),
    }));
    return [...hist, { ...last, ensemble: last?.observed, low: last?.observed, high: last?.observed }, ...future];
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">Forecast desk</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Four weeks ahead, as a range</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Chronological training, leakage-safe lags, baselines first. The ensemble only ships if it earns its keep against last week’s number.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-5">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Signal</span>
          <select className="w-full rounded-2xl border border-line bg-white px-3 py-3" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)}>
            {DISEASES.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Region</span>
          <select className="w-full rounded-2xl border border-line bg-white px-3 py-3" value={regionId} onChange={(e) => { setRegionId(e.target.value); setDistrictId(""); }}>
            <option value="national">National (all regions)</option>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">District</span>
          <select className="w-full rounded-2xl border border-line bg-white px-3 py-3" value={districtId} onChange={(e) => setDistrictId(e.target.value)} disabled={!localDistricts.length}>
            <option value="">{localDistricts.length ? "All districts in region" : "Region-level"}</option>
            {localDistricts.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Horizon (weeks)</span>
          <select className="w-full rounded-2xl border border-line bg-white px-3 py-3" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            {[2, 4, 6, 8, 12].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => load(true)}
          className="mt-6 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white"
          disabled={loading}
        >
          {loading ? "Running…" : "AI briefing"}
        </button>
      </div>

      <div className="mt-5">
        <Disclaimer />
      </div>
      <label className="mt-4 block rounded-2xl border border-dashed border-line bg-white px-4 py-3 text-sm">
        Replace demonstration series with official weekly CSV (headers must include date + cases)
        <input
          className="mt-2 block w-full text-xs"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const csv = await file.text();
            const res = await fetch("/api/series", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ diseaseId, regionId, districtId: districtId || undefined, csv, source: file.name }),
            });
            const json = await res.json();
            setSeriesNote(res.ok ? `Loaded ${json.weeks} official weeks from ${file.name}` : json.error || "Upload failed");
            if (res.ok) void load(false);
          }}
        />
        {seriesNote && <p className="mt-2 text-xs text-ghana-green">{seriesNote}</p>}
      </label>
      {err && <p className="mt-3 text-sm text-ghana-red">{err}</p>}
      {loading && !data && <p className="mt-6 text-sm text-muted">Computing leakage-safe ensemble…</p>}

      {data && (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <Stat label="Latest week" value={data.diagnostics.latest.toLocaleString()} hint={data.disease.unit} />
            <Stat label="8-week mean" value={data.diagnostics.last8Mean.toFixed(0)} hint={`z = ${data.diagnostics.latestZ} · CUSUM ${data.diagnostics.latestCusum ?? 0} · ${data.diagnostics.source}`} />
            <Stat
              label="Next week ensemble"
              value={Math.round(data.ensemble.points[0]?.point || 0).toLocaleString()}
              hint={`${Math.round(data.ensemble.points[0]?.low || 0)}-${Math.round(data.ensemble.points[0]?.high || 0)}`}
            />
            <Stat label="Test MAE (best family)" value={Math.min(...data.models.map((m) => m.mae)).toFixed(1)} hint="vs held-out 26 weeks" />
          </div>
          {data.nowcast && (
            <div className="mt-4 rounded-3xl border border-line bg-white p-5 text-sm">
              <div className="font-semibold">Reporting-delay nowcast (not a final count)</div>
              <p className="mt-1">
                Observed {data.nowcast.current.observed} · delay-adjusted {data.nowcast.current.nowcast} ({data.nowcast.current.low}-{data.nowcast.current.high}) · reporting assumed {Math.round(data.nowcast.current.completeness * 100)}% this week
              </p>
              <p className="mt-2 text-xs text-muted">{data.nowcast.caveat}</p>
            </div>
          )}

          <div className="mt-6 rounded-[28px] border border-line bg-white p-4 shadow-card md:p-6">
            <div className="mb-3 text-sm font-semibold">Observed history + ensemble interval</div>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <CartesianGrid stroke="#eef1f5" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="high" stroke="none" fill="#e8f6ee" name="Upper interval" />
                  <Area type="monotone" dataKey="low" stroke="none" fill="#f7f8fa" name="Lower interval" />
                  <Area type="monotone" dataKey="observed" stroke="#0b1220" fill="#0b122014" name="Observed" />
                  <Area type="monotone" dataKey="ensemble" stroke="#0b7a43" fill="#0b7a4322" name="Ensemble" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-line bg-white p-6">
              <h2 className="font-display text-2xl">Model scoreboard</h2>
              <p className="mt-1 text-sm text-muted">Lower is better. A model that cannot beat naive is not shipped to the ensemble.</p>
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="py-2">Model</th>
                    <th>MAE</th>
                    <th>RMSE</th>
                    <th>sMAPE</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.models].sort((a, b) => a.mae - b.mae).map((m) => (
                    <tr key={m.id} className="border-t border-line">
                      <td className="py-2">{m.name}</td>
                      <td>{m.mae.toFixed(1)}</td>
                      <td>{m.rmse.toFixed(1)}</td>
                      <td>{m.smape.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="border-t border-line font-semibold">
                    <td className="py-2">{data.ensemble.name}</td>
                    <td>{data.ensemble.mae.toFixed(1)}</td>
                    <td>{data.ensemble.rmse.toFixed(1)}</td>
                    <td>{data.ensemble.smape.toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-[28px] border border-line bg-white p-6">
              <h2 className="font-display text-2xl">Feature weight ≠ cause</h2>
              <ul className="mt-4 space-y-3">
                {data.featureImportance.map((f) => (
                  <li key={f.feature}>
                    <div className="flex justify-between text-sm">
                      <span>{f.feature}</span>
                      <span className="text-muted">{Math.round(f.weight * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper">
                      <div className="h-full bg-ghana-green" style={{ width: `${f.weight * 100}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">{f.caveat}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-line bg-white p-6">
              <h2 className="font-display text-2xl">Nowcast</h2>
              <p className="mt-3 leading-7">{data.narrative.nowcast}</p>
              <p className="mt-3 leading-7 text-muted">{data.narrative.outlook}</p>
              <p className="mt-3 leading-7">{data.narrative.oneHealth}</p>
              <p className="mt-3 text-sm text-muted">{data.narrative.limits}</p>
              {data.briefing && (
                <div className="mt-5 rounded-2xl bg-green-soft p-4 text-sm leading-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ghana-green">{data.briefingModel}</div>
                  <div className="mt-2 whitespace-pre-wrap">{data.briefing}</div>
                </div>
              )}
            </div>
            <div className="rounded-[28px] border border-line bg-white p-6">
              <h2 className="font-display text-2xl">Recent investigation flags</h2>
              <div className="mt-4 space-y-3">
                {data.alerts.length === 0 && <p className="text-sm text-muted">No z &gt; 2 weeks in the recent window.</p>}
                {data.alerts.slice().reverse().map((a) => (
                  <div key={a.date} className="rounded-2xl border border-line px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{a.date}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${a.level === "severe" ? "bg-red-soft text-ghana-red" : "bg-gold-soft"}`}>
                        {a.level} · {a.source} · z {a.z}{typeof a.cusum === "number" ? ` · CUSUM ${a.cusum}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{a.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted">{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-line bg-white p-5 shadow-card">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="font-display mt-1 text-3xl">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

export default function ForecastPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading forecast desk…</div>}>
      <ForecastInner />
    </Suspense>
  );
}
