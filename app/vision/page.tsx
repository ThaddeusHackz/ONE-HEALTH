"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Disclaimer } from "@/components/Disclaimer";
import { KeyStatus } from "@/components/KeyStatus";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.json,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xml,.html,image/*,application/pdf";
/** Inline vision limit per file - larger files belong in the 2 GB workspace upload. */
const MAX_FILE_MB = 8;

export default function VisionPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const previewsRef = useRef<string[]>([]);
  previewsRef.current = previews;
  const [kind, setKind] = useState("document");
  const [prompt, setPrompt] = useState("Extract any Ghana region, disease, dates and counts. Redact identifiers.");
  const [out, setOut] = useState("");
  const [model, setModel] = useState("");
  const [meta, setMeta] = useState("");
  const [redactions, setRedactions] = useState(0);
  const [busy, setBusy] = useState(false);

  // Release preview blob URLs when the page unmounts.
  useEffect(
    () => () => {
      for (const url of previewsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const [fileError, setFileError] = useState("");

  function onFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).slice(0, 8);
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    const next = incoming.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024);
    setFileError(
      tooBig.length
        ? `${tooBig.map((f) => f.name).join(", ")} exceeded ${MAX_FILE_MB} MB and were skipped. Larger files (up to 2 GB) can be stored from the AI Agent's sandbox → Files → Upload.`
        : "",
    );
    setFiles(next);
    // Release the previous preview URLs so repeated picks do not leak blobs.
    setPreviews((prev) => {
      for (const url of prev) URL.revokeObjectURL(url);
      return next.filter((f) => f.type.startsWith("image/")).map((f) => URL.createObjectURL(f));
    });
  }

  async function run() {
    if (!files.length) return;
    setBusy(true);
    setOut("");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.set("kind", kind);
      fd.set("prompt", prompt);
      const res = await fetch("/api/vision", { method: "POST", body: fd });
      const json = await res.json();
      setOut(json.text || json.analysis || json.error || "No analysis");
      setModel(json.model || "");
      setMeta(Array.isArray(json.files) ? json.files.map((f: { name: string; kind: string }) => `${f.name} · ${f.kind}`).join(" · ") : "");
      setRedactions(Number(json.redactions) || 0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">Vision lab</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Any file Ghana Health Service can hold</h1>
      <p className="mt-3 max-w-3xl text-muted">
        PDF circulars, Word memos, Excel line lists, CSV extracts, lab photos, IDSR scans. Text layers (including compressed PDF text) are extracted locally; images and PDFs are read by the Gemini vision engine on the independent GEMINI_API_KEY from Google AI Studio - never on the OpenRouter key. Every run is stored in the site database for the admin desk.
      </p>
      <div className="mt-5">
        <Disclaimer />
      </div>
      <div className="mt-3">
        <KeyStatus />
      </div>
      <img src="/images/vision-ingest.png" alt="Document ingestion" className="mt-8 w-full rounded-[28px] border border-line bg-white shadow-card" />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-line bg-white p-6 shadow-card">
          <h2 className="font-display text-2xl">Drop files</h2>
          <input className="mt-4 block w-full text-sm" type="file" accept={ACCEPT} multiple onChange={(e) => onFiles(e.target.files)} />
          {fileError && <p className="mt-2 text-[12px] text-ghana-red">{fileError}</p>}
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {files.map((f) => (
              <li key={f.name}>{f.name} · {Math.round(f.size / 1024)} KB · {f.type || "unknown"}</li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {previews.map((src) => (
              <img key={src} src={src} alt="" className="h-24 w-full rounded-xl object-cover ring-1 ring-line" />
            ))}
          </div>
          <select className="mt-4 w-full rounded-2xl border border-line px-3 py-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="document">Document / IDSR / circular</option>
            <option value="lab">Lab or RDT slip</option>
            <option value="clinical">Clinical / field photo</option>
            <option value="environment">Environment / veterinary</option>
            <option value="data">Spreadsheet / CSV extract</option>
          </select>
          <textarea className="mt-3 w-full rounded-2xl border border-line px-3 py-2 text-sm" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <button onClick={() => void run()} disabled={busy || !files.length} className="mt-3 w-full rounded-2xl bg-ink py-3 text-sm font-semibold text-white">
            {busy ? "Reading with the fallback chain…" : "Analyse and store"}
          </button>
        </div>
        <div className="rounded-[28px] border border-line bg-white p-6 shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted">{model || "awaiting file"}</div>
          {meta && <div className="mt-1 text-xs text-muted">{meta}</div>}
          {redactions > 0 && <div className="mt-1 text-xs text-ghana-red">{redactions} identifier(s) redacted before the model saw the text.</div>}
          {out ? <div className="mt-3"><Markdown text={out} /></div> : <p className="mt-3 text-sm text-muted">Nothing extracted yet. Do not upload folder numbers, names, or faces.</p>}
        </div>
      </div>
    </div>
  );
}
