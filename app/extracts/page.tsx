"use client";

import { useState } from "react";
import { DISEASES, REGIONS } from "@/lib/ghana";
import { districtsFor } from "@/lib/districts";
import { Disclaimer } from "@/components/Disclaimer";
import { KeyStatus } from "@/components/KeyStatus";

interface Quality {
  weeks: number;
  completeness: number;
  missingWeeks: string[];
  duplicates: string[];
  negativesClipped: number;
  dateStart: string;
  dateEnd: string;
  inferred: { dateCol: string; caseCol: string };
  warnings: string[];
}

export default function ExtractsPage() {
  const [diseaseId, setDiseaseId] = useState("cholera");
  const [regionId, setRegionId] = useState("greater-accra");
  const [districtId, setDistrictId] = useState("");
  const [note, setNote] = useState("");
  const [quality, setQuality] = useState<Quality | null>(null);
  const [review, setReview] = useState("");
  const [reviewModel, setReviewModel] = useState("");

  const districts = districtsFor(regionId).filter((d) => d.regionId === regionId);

  async function upload(file: File) {
    const csv = await file.text();
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diseaseId, regionId, districtId: districtId || undefined, csv, source: file.name }),
    });
    const json = await res.json();
    setQuality(json.quality || null);
    setReview(json.review || "");
    setReviewModel(json.reviewModel || "");
    setNote(res.ok ? `Stored ${json.weeks} weeks from ${file.name}` : json.error || "Upload failed");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">DHIMS2 / IDSR</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Load an official extract</h1>
      <p className="mt-3 text-muted">
        This is the upgrade that matters more than another model. A weekly DHIMS2 or IDSR file replaces the demonstration series for that disease and geography. Aggregates only - no folder numbers.
      </p>
      <div className="mt-5">
        <Disclaimer compact />
      </div>
      <div className="mt-3">
        <KeyStatus compact />
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <select className="rounded-2xl border border-line bg-white px-3 py-3 text-sm" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)}>
          {DISEASES.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select className="rounded-2xl border border-line bg-white px-3 py-3 text-sm" value={regionId} onChange={(e) => { setRegionId(e.target.value); setDistrictId(""); }}>
          <option value="national">National</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select className="rounded-2xl border border-line bg-white px-3 py-3 text-sm" value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
          <option value="">Region-level</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <label className="mt-6 block rounded-[28px] border border-dashed border-line bg-white p-6 text-sm">
        Drop a CSV (week_ending / date + cases). Semicolon or tab also works.
        <input className="mt-3 block w-full" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      </label>
      <a href="/api/series?template=1" className="mt-3 inline-block text-sm font-semibold text-ghana-green">Download a Ghana template</a>
      {note && <p className="mt-4 text-sm">{note}</p>}

      {quality && (
        <div className="mt-6 rounded-[28px] border border-line bg-white p-6 text-sm">
          <h2 className="font-display text-2xl">Quality log</h2>
          <p className="mt-2">Columns used: {quality.inferred.dateCol} → {quality.inferred.caseCol}</p>
          <p>{quality.weeks} weeks · {quality.dateStart} to {quality.dateEnd} · completeness {(quality.completeness * 100).toFixed(0)}%</p>
          <p>Negatives clipped: {quality.negativesClipped} · duplicate weeks: {quality.duplicates.length}</p>
          {quality.missingWeeks.length > 0 && (
            <p className="mt-2 text-muted">Missing week-starts (first 8): {quality.missingWeeks.slice(0, 8).join(", ")}</p>
          )}
          {quality.warnings.map((w) => (
            <p key={w} className="mt-2 text-ghana-red">{w}</p>
          ))}
          {review && (
            <div className="mt-4 rounded-2xl bg-green-soft p-4">
              <div className="text-xs uppercase tracking-wider text-ghana-green">{reviewModel || "Gemini review"}</div>
              <p className="mt-2 whitespace-pre-wrap">{review}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
