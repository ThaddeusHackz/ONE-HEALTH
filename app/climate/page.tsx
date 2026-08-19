"use client";

import { useEffect, useState } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import { KeyStatus } from "@/components/KeyStatus";
import { Markdown } from "@/components/Markdown";

interface Row {
  region: string;
  city: string;
  temp: number;
  humidity: number;
  rain1h: number;
  wind: number;
  description: string;
  source: string;
}

export default function ClimatePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState("Loading OpenWeather…");
  const [sitrep, setSitrep] = useState("");
  const [model, setModel] = useState("");

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then((j) => {
        setRows(j.rows || []);
        setNote(j.note || "");
      })
      .catch((e) => setNote((e as Error).message));
  }, []);

  async function brief() {
    setSitrep("Drafting…");
    try {
      const res = await fetch("/api/briefing");
      const json = await res.json();
      setSitrep(json.text || json.error || "No sitrep");
      setModel(json.model || "");
    } catch (e) {
      setSitrep((e as Error).message);
      setModel("network");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal">Environmental pillar</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Climate across Ghana</h1>
      <p className="mt-3 max-w-3xl text-muted">
        OpenWeather feeds Accra, Kumasi, Tamale and the other watch cities. Rain and humidity are pressure, not destiny - pair them with cholera and malaria intervals on the forecast desk.
      </p>
      <div className="mt-5">
        <Disclaimer compact />
      </div>
      <div className="mt-3">
        <KeyStatus />
      </div>
      <p className="mt-4 text-sm text-muted">{note}</p>
      <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-muted">
            <tr>
              <th className="px-4 py-3">Region</th>
              <th>City</th>
              <th>Temp</th>
              <th>Humidity</th>
              <th>Rain 1h</th>
              <th>Wind</th>
              <th>Sky</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.city} className="border-t border-line">
                <td className="px-4 py-3 font-semibold">{r.region}</td>
                <td>{r.city}</td>
                <td>{r.temp.toFixed(1)}°C</td>
                <td>{r.humidity}%</td>
                <td>{r.rain1h} mm</td>
                <td>{r.wind} m/s</td>
                <td className="capitalize">{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => void brief()} className="mt-6 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
        Draft morning sitrep (weather + Tavily + ensemble)
      </button>
      {sitrep && (
        <div className="mt-6 rounded-[28px] border border-line bg-white p-6">
          <div className="text-xs uppercase tracking-wider text-muted">{model}</div>
          <div className="mt-3"><Markdown text={sitrep} /></div>
        </div>
      )}
    </div>
  );
}
