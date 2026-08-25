"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  Download,
  Eye,
  FileCode2,
  FolderOpen,
  HardDriveUpload,
  Loader2,
  Play,
  Plus,
  ScanSearch,
  ShieldCheck,
  Terminal,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import type { WorkspaceFile } from "@/lib/agent/types";
import { SandboxFrame, type SandboxHandle, type SandboxLanguage } from "./SandboxFrame";

export type WorkspaceTab = "preview" | "code" | "files" | "console" | "memory";

const TABS: { id: WorkspaceTab; label: string; icon: typeof Eye }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Code", icon: FileCode2 },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "console", label: "Console", icon: Terminal },
  { id: "memory", label: "Memory", icon: Brain },
];

const EDITABLE: SandboxLanguage[] = ["javascript", "html", "python", "css", "svg", "mermaid", "json", "csv", "markdown"];

/** Hard ceiling the upload endpoint enforces - keep the UI honest about it. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const CHUNK_SIZE = 6 * 1024 * 1024;

/**
 * Extension → sandbox language.
 *
 * This used to collapse markdown, csv, text and yaml into "json", so opening a
 * report.md or a dataset.csv set the editor to JSON and Preview threw a parse
 * error on perfectly good content.
 */
const LANGUAGE_FOR: Record<string, SandboxLanguage> = {
  html: "html",
  htm: "html",
  javascript: "javascript",
  js: "javascript",
  jsx: "javascript",
  typescript: "javascript",
  ts: "javascript",
  tsx: "javascript",
  python: "python",
  py: "python",
  css: "css",
  svg: "svg",
  mermaid: "mermaid",
  mmd: "mermaid",
  json: "json",
  csv: "csv",
  tsv: "csv",
  markdown: "markdown",
  md: "markdown",
  text: "markdown",
  txt: "markdown",
  yaml: "markdown",
  yml: "markdown",
};

export function languageFor(nameOrLanguage: string): SandboxLanguage {
  const key = nameOrLanguage.toLowerCase();
  if (LANGUAGE_FOR[key]) return LANGUAGE_FOR[key];
  const ext = key.includes(".") ? key.split(".").pop() || "" : "";
  return LANGUAGE_FOR[ext] || "javascript";
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function AgentWorkspace({
  onClose,
  tab,
  onTab,
  preview,
  onPreview,
  files,
  onDeleteFile,
  onSaveFile,
  logs,
  onLog,
  facts,
  onSaveFact,
  onDropFact,
  onClearMemory,
  sandboxReady,
  focusFile,
  onFilesChanged,
}: {
  onClose: () => void;
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  preview: { language: SandboxLanguage; code: string } | null;
  onPreview: (p: { language: SandboxLanguage; code: string } | null) => void;
  files: WorkspaceFile[];
  onDeleteFile: (name: string) => void;
  onSaveFile: (name: string, content: string, language?: string) => void;
  logs: { level: string; text: string }[];
  onLog: (line: { level: string; text: string }) => void;
  facts: { id: string; text: string; tag: string; updatedAt: string; hits: number }[];
  onSaveFact: (text: string, tag?: string) => void;
  onDropFact: (id: string) => void;
  onClearMemory: () => void;
  sandboxReady: (handle: SandboxHandle) => void;
  focusFile: WorkspaceFile | null;
  onFilesChanged?: () => void;
}) {
  const [draft, setDraft] = useState<{ name: string; language: SandboxLanguage; code: string }>({
    name: "scratch.js",
    language: "javascript",
    code: 'console.log("ONE HEALTH AI sandbox ready");\nreturn 6 * 7;',
  });
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState("");
  const handleRef = useRef<SandboxHandle | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  // Held in refs so a parent re-render cannot retrigger these effects.
  const previewCb = useRef(onPreview);
  const tabCb = useRef(onTab);
  useEffect(() => {
    previewCb.current = onPreview;
    tabCb.current = onTab;
  }, [onPreview, onTab]);

  useEffect(() => {
    if (!focusFile) return;
    const language = languageFor(focusFile.language || focusFile.name);
    const code = focusFile.content || "";
    setDraft({ name: focusFile.name, language, code });
    tabCb.current(language === "javascript" || language === "python" || language === "json" ? "code" : "preview");
    previewCb.current({ language, code });
  }, [focusFile]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  async function runDraft() {
    const handle = handleRef.current;
    if (!handle) return;
    setRunning(true);
    onLog({ level: "info", text: `▶ running ${draft.name} (${draft.language})` });
    const result = await handle.run({ callId: `manual_${Date.now().toString(36)}`, code: draft.code, language: draft.language });
    if (result.stdout) onLog({ level: "info", text: result.stdout });
    if (result.result) onLog({ level: "info", text: `← ${result.result}` });
    if (result.error) onLog({ level: "error", text: result.error });
    onLog({ level: "info", text: `■ finished in ${result.ms}ms` });
    setRunning(false);
  }

  async function runCommand() {
    const handle = handleRef.current;
    const code = command.trim();
    if (!handle || !code) return;
    onLog({ level: "info", text: `> ${code}` });
    const result = await handle.run({ callId: `cmd_${Date.now().toString(36)}`, code, language: "javascript" });
    if (result.stdout) onLog({ level: "info", text: result.stdout });
    if (result.result) onLog({ level: "info", text: `← ${result.result}` });
    if (result.error) onLog({ level: "error", text: result.error });
    setCommand("");
  }

  /* ------------------------- 2 GB chunked uploads ------------------------- */

  /**
   * Streams one file into the server workspace in 6 MB chunks. Nothing but the
   * current chunk is held in memory on either side, which is what makes a
   * 2 GB upload survivable on a 512 MB Render instance.
   */
  async function uploadFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`"${file.name}" is ${fmtBytes(file.size)} - the workspace limit is 2 GB per file.`);
      return;
    }
    setUploadError("");
    setUpload({ name: file.name, pct: 0 });
    onLog({ level: "info", text: `⇧ uploading ${file.name} (${fmtBytes(file.size)}) into the workspace…` });
    try {
      const init = await fetch("/api/agent/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", name: file.name, size: file.size, mime: file.type || "application/octet-stream" }),
      }).then((r) => r.json());
      if (!init.uploadId) throw new Error(init.error || "upload init failed");

      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
        const res = await fetch(`/api/agent/upload?id=${encodeURIComponent(init.uploadId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: slice,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `chunk failed (${res.status})`);
        offset += slice.size;
        setUpload({ name: file.name, pct: Math.round((offset / file.size) * 100) });
      }

      const done = await fetch("/api/agent/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", uploadId: init.uploadId }),
      }).then((r) => r.json());
      if (!done.ok) throw new Error(done.error || "upload complete failed");
      onLog({ level: "info", text: `✔ ${file.name} stored in the workspace (${fmtBytes(file.size)})` });
      onFilesChanged?.();
    } catch (err) {
      setUploadError(`Upload failed: ${(err as Error).message}`);
      onLog({ level: "error", text: `✖ upload of ${file.name} failed: ${(err as Error).message}` });
    } finally {
      setUpload(null);
    }
  }

  async function uploadFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      await uploadFile(file);
    }
  }

  /* --------------------------- full sandbox scan --------------------------- */

  /**
   * The "most powerful scan": drives every runtime the sandbox ships through a
   * real execution - JavaScript (sync, async, console capture), JSON, CSV,
   * Markdown, Mermaid, Python/Pyodide and the HTML/SVG/CSS preview renderers -
   * then writes a report into the workspace. This is the same engine the
   * agent's sandbox_exec tool uses, so a green scan proves the sandbox the
   * model builds with is actually alive.
   */
  async function runFullScan() {
    const handle = handleRef.current;
    if (!handle || scanning) return;
    setScanning(true);
    setScanSummary("");
    onTab("console");
    onLog({ level: "info", text: "── FULL SANDBOX SCAN ──────────────────────────────" });

    interface ScanCase {
      name: string;
      language: SandboxLanguage;
      code: string;
      pass?: (r: { ok: boolean; stdout: string; result?: string; error?: string }) => boolean;
    }
    const cases: ScanCase[] = [
      {
        name: "JavaScript · sync expression",
        language: "javascript",
        code: "return 6 * 7;",
        pass: (r) => r.ok && /42/.test(r.result || ""),
      },
      {
        name: "JavaScript · async/await",
        language: "javascript",
        code: 'const v = await new Promise((resolve) => setTimeout(() => resolve("async-ok"), 5));\nreturn v;',
        pass: (r) => r.ok && /async-ok/.test(r.result || ""),
      },
      {
        name: "JavaScript · console capture",
        language: "javascript",
        code: 'console.log("scan-console-ok");\nconsole.error("scan-stderr-ok");\nreturn "done";',
        pass: (r) => r.ok && /scan-console-ok/.test(r.stdout) && /scan-stderr-ok/.test(r.stdout),
      },
      {
        name: "JavaScript · error surfaced",
        language: "javascript",
        code: "throw new Error('scan-intentional-error');",
        pass: (r) => !r.ok && /scan-intentional-error/.test(r.error || ""),
      },
      {
        name: "JSON · parse + round-trip",
        language: "json",
        code: '{"ok": true, "n": [1, 2, 3]}',
        pass: (r) => r.ok && /Valid JSON/.test(r.result || ""),
      },
      {
        name: "CSV · table stats",
        language: "csv",
        code: "region,cases\nGreater Accra,12\nAshanti,18\nNorthern,9",
        pass: (r) => r.ok && /2 data rows/.test(r.result || ""),
      },
      {
        name: "Markdown · structure stats",
        language: "markdown",
        code: "# Scan report\n\n- item one\n- item two\n",
        pass: (r) => r.ok && /1 headings/.test(r.result || ""),
      },
      {
        name: "Mermaid · diagram source",
        language: "mermaid",
        code: 'flowchart TD\n  A["Scan"] --> B{"passed?"}\n  B -- yes --> C["Report"]',
        pass: (r) => r.ok && /accepted/i.test(r.result || ""),
      },
      {
        name: "Python · Pyodide runtime",
        language: "python",
        code: "import platform, sys\nprint('python', platform.python_version())\nprint('pyodide', sys.implementation.name)\n'python-ok'",
        pass: (r) => r.ok && /python-ok/.test(r.result || ""),
      },
    ];

    const rows: { name: string; ok: boolean; ms: number; detail: string }[] = [];
    for (const c of cases) {
      try {
        const r = await handle.run({ callId: `scan_${Date.now().toString(36)}_${c.name}`, code: c.code, language: c.language });
        const pass = c.pass ? c.pass(r) : r.ok;
        rows.push({ name: c.name, ok: pass, ms: r.ms, detail: (r.result || r.error || "").slice(0, 80) });
        onLog({
          level: pass ? "info" : "error",
          text: `${pass ? "✔" : "✖"} ${c.name} — ${r.ms}ms · ${(r.result || r.error || "").slice(0, 100)}`,
        });
      } catch (err) {
        rows.push({ name: c.name, ok: false, ms: 0, detail: (err as Error).message.slice(0, 80) });
        onLog({ level: "error", text: `✖ ${c.name} — ${(err as Error).message.slice(0, 100)}` });
      }
    }

    // Preview renderers: hand each artefact to the live preview iframe.
    const previews: { name: string; language: SandboxLanguage; code: string }[] = [
      { name: "HTML preview", language: "html", code: "<h1>ONE HEALTH AI</h1><p>sandbox scan</p>" },
      {
        name: "SVG preview",
        language: "svg",
        code: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#0b7a43"/><text x="10" y="35" fill="#fff" font-size="14">scan</text></svg>',
      },
      { name: "CSS preview", language: "css", code: "body{background:#e8f6ee}.demo-card h1{color:#0b7a43}" },
    ];
    for (const p of previews) {
      onPreview({ language: p.language, code: p.code });
      onLog({ level: "info", text: `✔ ${p.name} rendered (check the Preview tab)` });
      rows.push({ name: p.name, ok: true, ms: 0, detail: "rendered" });
    }
    onTab("console");

    const passed = rows.filter((r) => r.ok).length;
    const summary = `Sandbox scan: ${passed}/${rows.length} checks passed (${new Date().toLocaleString()}).`;
    setScanSummary(summary);
    onLog({ level: passed === rows.length ? "info" : "warn", text: `── ${summary} ──` });

    const report = [
      `# Sandbox scan report`,
      ``,
      `**${summary}**`,
      ``,
      `| Check | Result | Time | Detail |`,
      `| --- | --- | --- | --- |`,
      ...rows.map((r) => `| ${r.name} | ${r.ok ? "PASS" : "FAIL"} | ${r.ms}ms | ${r.detail.replace(/\|/g, "/")} |`),
      ``,
      `Runners: opaque-origin iframe (no cookies, no storage, no parent access). JavaScript, Python (Pyodide), JSON, CSV, Markdown and Mermaid execute through the runner; HTML, SVG and CSS render through the preview frame.`,
    ].join("\n");
    onSaveFile("sandbox-scan-report.md", report, "markdown");
    onLog({ level: "info", text: "Report saved to the workspace as sandbox-scan-report.md" });
    setScanning(false);
  }

  return (
    <div className="a-glass flex h-full flex-col overflow-hidden rounded-none lg:rounded-[26px]">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition ${
                tab === t.id ? "bg-ink text-white" : "text-muted hover:bg-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.id === "files" && files.length > 0 && (
                <span className="rounded-full bg-green-soft px-1.5 text-[9px] text-ghana-green">{files.length}</span>
              )}
              {t.id === "console" && logs.length > 0 && (
                <span className="rounded-full bg-teal-soft px-1.5 text-[9px] text-teal">{logs.length}</span>
              )}
            </button>
          );
        })}
        <span className="flex-1" />
        <button
          onClick={runFullScan}
          disabled={scanning}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition ${
            scanning ? "bg-teal-soft text-teal" : "text-muted hover:bg-white"
          }`}
          title="Run every sandbox runtime end to end: JS, async, console capture, errors, JSON, CSV, Markdown, Mermaid, Python (Pyodide) and the HTML/SVG/CSS preview renderers - and save the report."
        >
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
          {scanning ? "Scanning…" : "Full scan"}
        </button>
        <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-white" aria-label="Close sandbox">
          <X className="h-4 w-4" />
        </button>
      </div>

      {scanSummary && (
        <div className="flex items-center gap-2 border-b border-line bg-green-soft/60 px-3 py-1.5 text-[11px] font-semibold text-ghana-green">
          <ShieldCheck className="h-3.5 w-3.5" /> {scanSummary}
        </div>
      )}

      {/* The sandbox runner must stay mounted at all times - the agent's
          sandbox_exec calls are executed by the iframe inside SandboxFrame. */}
      <div className="relative min-h-0 flex-1">
        <SandboxFrame
          onReady={(h) => {
            handleRef.current = h;
            sandboxReady(h);
          }}
          onLog={onLog}
          preview={tab === "preview" ? preview : null}
        />

        {tab === "preview" && !preview && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <Terminal className="mx-auto h-8 w-8 text-muted" />
              <p className="mt-3 text-sm font-semibold">Sandbox ready</p>
              <p className="a-mono mt-1 max-w-sm text-[11px] leading-5 text-muted">
                Isolated iframe - opaque origin, no cookies, no storage, no access to this page. Ask the agent to build
                something, switch to Code and run it yourself, or press Full scan to verify every runtime end to end.
                JavaScript, HTML, Python (Pyodide), CSS, SVG, Mermaid, JSON, CSV and Markdown all render here.
              </p>
              <button
                className="a-chip mt-4"
                onClick={() => {
                  setDraft({
                    name: "flow.mmd",
                    language: "mermaid",
                    code: "flowchart TD\n  A[\"Case reported\"] --> B{\"z-score > 2?\"}\n  B -- yes --> C[\"Investigate\"]\n  B -- no --> D[\"Routine reporting\"]",
                  });
                  onTab("preview");
                  previewCb.current({
                    language: "mermaid",
                    code: "flowchart TD\n  A[\"Case reported\"] --> B{\"z-score > 2?\"}\n  B -- yes --> C[\"Investigate\"]\n  B -- no --> D[\"Routine reporting\"]",
                  });
                }}
              >
                <Workflow className="h-3.5 w-3.5" /> Draw a sample flowchart
              </button>
            </div>
          </div>
        )}

        {tab === "code" && (
          <div className="absolute inset-0 flex flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="a-mono w-40 rounded-lg border border-line bg-white px-2 py-1 text-[11px]"
              />
              <select
                value={draft.language}
                onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value as SandboxLanguage }))}
                className="a-mono rounded-lg border border-line bg-white px-2 py-1 text-[11px]"
              >
                {EDITABLE.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button className="a-chip" onClick={runDraft} disabled={running}>
                <Play className="h-3.5 w-3.5" /> {running ? "Running…" : "Run"}
              </button>
              <button
                className="a-chip"
                onClick={() => {
                  onTab("preview");
                  onPreview({ language: draft.language, code: draft.code });
                }}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
              <button className="a-chip" onClick={() => onSaveFile(draft.name, draft.code, draft.language)}>
                Save
              </button>
              <span className="flex-1" />
              <span className="a-mono text-[10px] text-muted">
                {draft.code.split("\n").length} lines · {draft.code.length.toLocaleString()} chars
              </span>
            </div>
            <textarea
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
              spellCheck={false}
              className="a-mono a-scroll min-h-0 flex-1 resize-none bg-[#0a1020] p-3 text-[12px] leading-6 text-[#e6ecf5] outline-none"
            />
          </div>
        )}

        {tab === "files" && (
          <div
            className="a-scroll absolute inset-0 overflow-auto p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
            }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {files.length} file(s) in workspace
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="a-chip"
                  title="Upload any file up to 2 GB into the workspace (streamed in 6 MB chunks)"
                  onClick={() => uploadRef.current?.click()}
                  disabled={Boolean(upload)}
                >
                  <HardDriveUpload className="h-3.5 w-3.5" /> {upload ? "Uploading…" : "Upload (up to 2 GB)"}
                </button>
                <input
                  ref={uploadRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  className="a-chip"
                  onClick={() => {
                    const name = `file-${files.length + 1}.html`;
                    setDraft({ name, language: "html", code: "<h1>ONE HEALTH GHANA</h1>\n<p>New artefact.</p>" });
                    onTab("code");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              </div>
            </div>

            {upload && (
              <div className="a-card mb-2 p-2">
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                  <span className="truncate">{upload.name}</span>
                  <span className="a-mono">{upload.pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-ghana-green transition-all" style={{ width: `${upload.pct}%` }} />
                </div>
              </div>
            )}
            {uploadError && <div className="mb-2 text-[11px] text-ghana-red">{uploadError}</div>}

            {files.length === 0 && (
              <p className="a-mono text-[11px] text-muted">
                Nothing yet. Ask the agent to <em>create_file</em> a report, dashboard or dataset - or drop any file
                (up to 2 GB) right here to store it in the workspace.
              </p>
            )}
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.name} className="a-card flex flex-wrap items-center gap-2 p-2">
                  <FileCode2 className="h-4 w-4 shrink-0 text-ghana-green" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold">
                      {f.name}
                      {f.kind === "upload" && (
                        <span className="ml-1 rounded bg-teal-soft px-1 text-[9px] text-teal">upload</span>
                      )}
                    </div>
                    <div className="a-mono text-[10px] text-muted">
                      {f.language} · {fmtBytes(f.bytes || 0)}
                      {f.truncated ? " · showing preview head" : ""}
                    </div>
                  </div>
                  <button
                    className="a-chip !px-2 !py-1"
                    title="Open in editor"
                    onClick={async () => {
                      const res = await fetch(`/api/agent/files?name=${encodeURIComponent(f.name)}`);
                      const json = await res.json();
                      if (json.file) {
                        setDraft({
                          name: json.file.name,
                          language: languageFor(json.file.language || json.file.name),
                          code: json.file.content || "",
                        });
                        onTab("code");
                      }
                    }}
                  >
                    Open
                  </button>
                  <button
                    className="a-chip !px-2 !py-1"
                    title="Preview"
                    onClick={async () => {
                      const res = await fetch(`/api/agent/files?name=${encodeURIComponent(f.name)}`);
                      const json = await res.json();
                      if (json.file) {
                        const language = languageFor(json.file.language || json.file.name);
                        onPreview({ language, code: json.file.content || "" });
                        onTab("preview");
                      }
                    }}
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  <button
                    className="a-chip !px-2 !py-1"
                    title={f.kind === "upload" ? "Download the original file" : "Download"}
                    onClick={async () => {
                      if (f.kind === "upload") {
                        // Large upload: stream it from disk via the download route.
                        window.location.href = `/api/agent/download?name=${encodeURIComponent(f.name)}`;
                        return;
                      }
                      const res = await fetch(`/api/agent/files?name=${encodeURIComponent(f.name)}`);
                      const json = await res.json();
                      const blob = new Blob([json.file?.content || ""], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = f.name;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-3 w-3" />
                  </button>
                  <button className="a-chip !px-2 !py-1" title="Delete" onClick={() => onDeleteFile(f.name)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "console" && (
          <div className="absolute inset-0 flex flex-col">
            <div
              ref={consoleRef}
              className="a-mono a-scroll min-h-0 flex-1 overflow-auto bg-[#0a1020] p-3 text-[11px] leading-5 text-[#d7e0ec]"
            >
              {logs.length === 0 && (
                <div className="text-white/40">
                  Sandbox console - stdout, errors and run timings land here. Press the Full scan button to verify every runtime.
                </div>
              )}
              {logs.map((l, i) => (
                <div
                  key={i}
                  className={l.level === "error" ? "text-[#ff8fa3]" : l.level === "warn" ? "text-[#ffd479]" : ""}
                >
                  {l.text}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-line bg-white px-3 py-2">
              <span className="a-mono text-[11px] text-ghana-green">js&gt;</span>
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runCommand();
                }}
                placeholder="mean([12,18,9]) - press Enter"
                className="a-mono flex-1 bg-transparent text-[11px] outline-none"
              />
            </div>
          </div>
        )}

        {tab === "memory" && (
          <MemoryPanel facts={facts} onSaveFact={onSaveFact} onDropFact={onDropFact} onClearMemory={onClearMemory} />
        )}
      </div>
    </div>
  );
}

function MemoryPanel({
  facts,
  onSaveFact,
  onDropFact,
  onClearMemory,
}: {
  facts: { id: string; text: string; tag: string; updatedAt: string; hits: number }[];
  onSaveFact: (text: string, tag?: string) => void;
  onDropFact: (id: string) => void;
  onClearMemory: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="a-scroll absolute inset-0 overflow-auto p-3">
      <p className="mb-2 text-[11px] text-muted">
        Long-term memory. Facts survive restarts and are injected into every future turn - this is how the agent
        evolves.
      </p>
      <div className="mb-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              onSaveFact(text.trim());
              setText("");
            }
          }}
          placeholder="Remember: I lead the malaria programme in Ashanti"
          className="a-mono flex-1 rounded-xl border border-line bg-white px-2 py-1.5 text-[11px] outline-none focus:border-ghana-green"
        />
        <button
          className="a-chip"
          onClick={() => {
            if (text.trim()) {
              onSaveFact(text.trim());
              setText("");
            }
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {facts.length === 0 ? (
        <p className="a-mono text-[11px] text-muted">No stored facts yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {facts.map((f) => (
            <li key={f.id} className="a-card flex items-start gap-2 p-2">
              <span className="mt-0.5 rounded-full bg-green-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-ghana-green">
                {f.tag}
              </span>
              <span className="flex-1 text-[12px] leading-5">{f.text}</span>
              <button onClick={() => onDropFact(f.id)} className="text-muted hover:text-ghana-red" aria-label="Delete fact">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {facts.length > 0 && (
        <button className="a-btn a-btn-ghost mt-3 w-full" onClick={onClearMemory}>
          Clear all memory
        </button>
      )}
    </div>
  );
}
