"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";

interface Snap {
  id: string;
  name: string;
  pillar: string;
  latest: number;
  unit: string;
  z: number;
  nextWeek: number;
  low: number;
  high: number;
  alert: boolean;
}

export default function SurveillancePage() {
  const [rows, setRows] = useState<Snap[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/forecast?snapshot=1")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Snapshot failed");
        setRows(j.snapshot || []);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">National IDSR board</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">What is unusual this week?</h1>
      <p className="mt-3 max-w-3xl text-muted">
        Forecasting asks “what is likely next.” Detection asks “is what we are seeing strange enough to act?” Both live here. Neither replaces a district rapid-response team.
      </p>
      <div className="mt-5">
        <Disclaimer />
      </div>
      <img src="/images/early-warning.png" alt="Early warning workflow" className="mt-8 w-full rounded-[28px] border border-line bg-white shadow-card" />

      <div className="mt-8 overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-muted">
            <tr>
              <th className="px-4 py-3">Signal</th>
              <th>Pillar</th>
              <th>Latest</th>
              <th>z</th>
              <th>Next week (interval)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-6 text-muted" colSpan={6}>Computing national z-scores…</td>
              </tr>
            )}
            {err && (
              <tr>
                <td className="px-4 py-6 text-ghana-red" colSpan={6}>{err}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="capitalize">{r.pillar}</td>
                <td>
                  {r.latest.toLocaleString()}
                  <div className="text-[11px] text-muted">{r.unit}</div>
                </td>
                <td className={r.alert ? "font-semibold text-ghana-red" : ""}>{r.z.toFixed(2)}</td>
                <td>
                  {Math.round(r.nextWeek).toLocaleString()}
                  <div className="text-[11px] text-muted">
                    {Math.round(r.low)}-{Math.round(r.high)}
                  </div>
                </td>
                <td className="pr-4">
                  <Link href={`/forecast?disease=${r.id}`} className="text-ghana-green">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
