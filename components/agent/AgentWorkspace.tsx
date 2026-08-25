"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  Download,
  Eye,
  FileCode2,
  FolderOpen,
  Play,
  Plus,
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
}) {
  const [draft, setDraft] = useState<{ name: string; language: SandboxLanguage; code: string }>({
    name: "scratch.js",
    language: "javascript",
    code: 'console.log("ONE HEALTH AI sandbox ready");\nreturn 6 * 7;',
  });
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const handleRef = useRef<SandboxHandle | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <div className="a-glass flex h-full flex-col overflow-hidden rounded-none lg:rounded-l-[26px]">
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
        <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-white" aria-label="Close sandbox">
          <X className="h-4 w-4" />
        </button>
      </div>

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
                something, or switch to Code and run it yourself. JavaScript, HTML, Python (Pyodide), CSS, SVG,
                Mermaid, JSON, CSV and Markdown all render here.
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
          <div className="a-scroll absolute inset-0 overflow-auto p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {files.length} file(s) in workspace
              </span>
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
            {files.length === 0 && (
              <p className="a-mono text-[11px] text-muted">
                Nothing yet. Ask the agent to <em>create_file</em> a report, dashboard or dataset.
              </p>
            )}
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.name} className="a-card flex items-center gap-2 p-2">
                  <FileCode2 className="h-4 w-4 shrink-0 text-ghana-green" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold">{f.name}</div>
                    <div className="a-mono text-[10px] text-muted">
                      {f.language} · {(f.bytes || 0).toLocaleString()} bytes
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
                    title="Download"
                    onClick={async () => {
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
                <div className="text-white/40">Sandbox console - stdout, errors and run timings land here.</div>
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
