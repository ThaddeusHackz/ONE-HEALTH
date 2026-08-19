"use client";

import { useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Disclaimer } from "@/components/Disclaimer";

export default function VisionPage() {
  const [images, setImages] = useState<string[]>([]);
  const [kind, setKind] = useState<"document" | "clinical" | "lab" | "environment">("document");
  const [prompt, setPrompt] = useState("Extract any Ghana region, disease, dates and counts. Redact identifiers.");
  const [out, setOut] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  function onFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).slice(0, 6).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setImages((prev) => [...prev, String(reader.result)].slice(0, 6));
      reader.readAsDataURL(file);
    });
  }

  async function run() {
    if (!images.length) return;
    setBusy(true);
    setOut("");
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, kind, prompt }),
      });
      const json = await res.json();
      setOut(json.text || json.error || "No analysis");
      setModel(json.model || "");
    } finally {
      setBusy(false);
    }
  }

  async function ingest(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch("/api/ingest", { method: "POST", body: fd });
    const json = await res.json();
    setOut(json.analysis || JSON.stringify(json, null, 2));
    setModel(json.model || "");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">Vision lab</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Load any picture or document</h1>
      <p className="mt-3 max-w-3xl text-muted">
        The professor’s instruction: the system must pick up pictures and documents of any type, read them with high-capability vision, and feed the forecast desk. It will still be wrong sometimes. That is why every extract carries a confidence and a human verification step.
      </p>
      <div className="mt-5">
        <Disclaimer />
      </div>
      <img src="/images/vision-ingest.png" alt="Document ingestion" className="mt-8 w-full rounded-[28px] border border-line bg-white shadow-card" />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-line bg-white p-6 shadow-card">
          <h2 className="font-display text-2xl">Drop images or scans</h2>
          <input className="mt-4 block w-full text-sm" type="file" accept="image/*" multiple onChange={(e) => onFiles(e.target.files)} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {images.map((src, i) => (
              <img key={i} src={src} alt="" className="h-24 w-full rounded-xl object-cover ring-1 ring-line" />
            ))}
          </div>
          <select className="mt-4 w-full rounded-2xl border border-line px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="document">Document / IDSR / circular</option>
            <option value="lab">Lab or RDT slip</option>
            <option value="clinical">Clinical / field photo</option>
            <option value="environment">Environment / veterinary</option>
          </select>
          <textarea className="mt-3 w-full rounded-2xl border border-line px-3 py-2 text-sm" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button onClick={run} disabled={busy || !images.length} className="mt-3 w-full rounded-2xl bg-ink py-3 text-sm font-semibold text-white">
            {busy ? "Reading…" : "Run vision chain"}
          </button>
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Or ingest CSV / text / mixed files</h3>
            <input className="mt-2 block w-full text-sm" type="file" multiple onChange={(e) => void ingest(e.target.files)} />
          </div>
        </div>
        <div className="rounded-[28px] border border-line bg-white p-6 shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted">{model || "awaiting file"}</div>
          {out ? <div className="mt-3"><Markdown text={out} /></div> : <p className="mt-3 text-sm text-muted">Nothing extracted yet. Do not upload folder numbers, names, or faces.</p>}
        </div>
      </div>
    </div>
  );
}
