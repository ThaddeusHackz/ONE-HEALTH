"use client";

import { useState } from "react";
import { DISEASES, REGIONS } from "@/lib/ghana";
import { FIELD_LANGUAGES } from "@/lib/languages";
import { Disclaimer } from "@/components/Disclaimer";
import { KeyStatus } from "@/components/KeyStatus";
import { Markdown } from "@/components/Markdown";

export default function FieldPage() {
  const [diseaseId, setDiseaseId] = useState("malaria");
  const [regionId, setRegionId] = useState("northern");
  const [language, setLanguage] = useState("tw");
  const [text, setText] = useState("");
  const [speakable, setSpeakable] = useState("");
  const [model, setModel] = useState("");
  const [now, setNow] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/field-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diseaseId, regionId, language }),
      });
      const json = await res.json();
      setText(json.text || json.error || "");
      setSpeakable(json.speakable || json.text || "");
      setModel(json.model || "");
      const c = json.nowcast?.current;
      setNow(c ? `Observed ${c.observed} · nowcast ${c.nowcast} (${c.low}-${c.high}) · reporting ${Math.round(c.completeness * 100)}%` : "");
    } finally {
      setBusy(false);
    }
  }

  async function speak() {
    if (!speakable) return;
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: speakable }),
    });
    const type = res.headers.get("content-type") || "";
    if (type.includes("audio")) {
      const url = URL.createObjectURL(await res.blob());
      void new Audio(url).play();
      return;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(speakable));
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">CHPS / district card</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Spoken field brief</h1>
      <p className="mt-3 text-muted">
        Ninety words a community officer can hear in Twi, Ewe, Ga, Hausa or English. Speech uses ElevenLabs when the key is live, otherwise the device voice. Twi/Ewe synthesis is imperfect - read the text if the voice stumbles.
      </p>
      <div className="mt-5">
        <Disclaimer compact />
      </div>
      <div className="mt-3">
        <KeyStatus compact />
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <select className="rounded-2xl border border-line bg-white px-3 py-3 text-sm" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)}>
          {DISEASES.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="rounded-2xl border border-line bg-white px-3 py-3 text-sm" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="national">National</option>
          {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className="rounded-2xl border border-line bg-white px-3 py-3 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {FIELD_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={() => void run()} disabled={busy} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
          {busy ? "Drafting…" : "Draft field card"}
        </button>
        <button onClick={() => void speak()} disabled={!speakable} className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold">
          Speak it
        </button>
      </div>
      {now && <p className="mt-4 text-sm text-muted">{now}</p>}
      {text && (
        <div className="mt-6 rounded-[28px] border border-line bg-white p-6">
          <div className="text-xs uppercase tracking-wider text-muted">{model}</div>
          <div className="mt-3"><Markdown text={text} /></div>
        </div>
      )}
    </div>
  );
}
