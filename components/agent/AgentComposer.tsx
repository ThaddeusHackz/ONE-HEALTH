"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Image as ImageIcon, Loader2, Paperclip, SlidersHorizontal, Square, X } from "lucide-react";
import type { AgentAttachment, AgentMode } from "@/lib/agent/types";
import type { ToolInfo } from "./useAgent";
import { VoiceButton } from "./Voice";

const MODES: { id: AgentMode; label: string; hint: string }[] = [
  { id: "chat", label: "Chat", hint: "General assistant with every tool available" },
  { id: "research", label: "Deep Research", hint: "Multi-step sourced investigation of the live web" },
  { id: "builder", label: "Builder", hint: "Writes files and verifies them in the sandbox" },
  { id: "vision", label: "Vision", hint: "Reads the photos, PDFs and documents you attach" },
  { id: "health", label: "One Health", hint: "Ghana forecasts, national board, climate signals" },
];

/**
 * Attachments travel as base64 inside a JSON body to a 512 MB Render instance,
 * so the caps are deliberately below what a desktop app would allow.
 */
const MAX_FILE_MB = 4;
const MAX_FILES = 5;

async function toAttachment(file: File): Promise<AgentAttachment | null> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) return null;
  const mime = file.type || "application/octet-stream";
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText =
    mime.startsWith("text/") || /\.(txt|md|csv|json|tsv|log|ya?ml|xml|js|ts|py|html|css)$/i.test(file.name);

  let text = "";
  if (isText) {
    text = await file.text().catch(() => "");
  }
  return {
    name: file.name || "upload",
    mime,
    dataUrl,
    kind: isImage ? "image" : isPdf ? "pdf" : "text",
    text,
    bytes: file.size,
  };
}

export function AgentComposer({
  onSend,
  busy,
  onStop,
  tools,
  settings,
  onSettings,
  disabled,
}: {
  onSend: (input: { text: string; attachments?: AgentAttachment[] }) => void;
  busy: boolean;
  onStop?: () => void;
  tools: ToolInfo[];
  settings: { mode: AgentMode; tools: string[]; model: string; temperature: number; reasoning: boolean };
  onSettings: (patch: Partial<typeof settings>) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 260)}px`;
  }, [text]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, attachments, busy]);

  async function addFiles(list: FileList | File[]) {
    setError("");
    const incoming = Array.from(list).slice(0, MAX_FILES);
    const parsed = await Promise.all(incoming.map(toAttachment));
    const rejected = parsed.filter((p) => !p).length;
    if (rejected) setError(`${rejected} file(s) skipped - each file must be under ${MAX_FILE_MB} MB.`);
    setAttachments((prev) => {
      const next = [...prev, ...(parsed.filter(Boolean) as AgentAttachment[])];
      if (next.length > MAX_FILES) setError(`Up to ${MAX_FILES} attachments per turn.`);
      return next.slice(0, MAX_FILES);
    });
  }

  function submit() {
    if (busy || disabled) return;
    if (!text.trim() && !attachments.length) return;
    onSend({ text, attachments: attachments.length ? attachments : undefined });
    setText("");
    setAttachments([]);
    if (areaRef.current) areaRef.current.style.height = "auto";
  }

  const toggleTool = (name: string) => {
    const has = settings.tools.includes(name);
    onSettings({ tools: has ? settings.tools.filter((t) => t !== name) : [...settings.tools, name] });
  };

  return (
    <div className="px-4 pb-5">
      <div
        className={`a-glass rounded-[28px] p-3 transition ${dragging ? "ring-2 ring-ghana-green" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
      >
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <span key={a.name} className="a-chip !py-1">
                {a.kind === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                <span className="max-w-[10rem] truncate">{a.name}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.name !== a.name))}
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={areaRef}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files || []);
            if (files.length) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          placeholder={
            settings.mode === "builder"
              ? "Describe the app, report or dashboard to build - it will be written and tested in the sandbox…"
              : settings.mode === "research"
                ? "Ask for a sourced investigation of anything on the live internet…"
                : settings.mode === "vision"
                  ? "Attach a photo, PDF, Excel or CSV and ask what is in it…"
                  : "Ask anything - Ghana health, analysis, code, images, live data. ⌘↵ to send"
          }
          className="a-input a-scroll max-h-[260px] min-h-[52px] px-2 py-2"
          disabled={disabled}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="a-seg">
            {MODES.map((m) => (
              <button
                key={m.id}
                data-on={settings.mode === m.id}
                title={m.hint}
                onClick={() => onSettings({ mode: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button className="a-chip" onClick={() => fileRef.current?.click()} title="Attach files">
            <Paperclip className="h-3.5 w-3.5" /> Attach
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <VoiceButton onTranscript={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} disabled={busy} />

          <button className="a-chip" data-on={settings.reasoning} onClick={() => onSettings({ reasoning: !settings.reasoning })} title="Think deeper before answering">
            Think deeper
          </button>

          <button className="a-chip" data-on={showTools} onClick={() => setShowTools((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Tools {settings.tools.length}/{tools.length}
          </button>

          <span className="flex-1" />

          {busy ? (
            <button className="a-btn a-btn-ghost" onClick={onStop}>
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          ) : (
            <button className="a-btn a-btn-primary" onClick={submit} disabled={disabled || (!text.trim() && !attachments.length)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              Send
            </button>
          )}
        </div>

        {showTools && (
          <div className="a-in a-scroll mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-auto border-t border-line pt-3">
            {tools.map((t) => (
              <button key={t.name} className="a-chip !text-[11px]" data-on={settings.tools.includes(t.name)} onClick={() => toggleTool(t.name)} title={t.description}>
                {t.name}
                {t.client && <span className="rounded bg-teal-soft px-1 text-[9px] text-teal">sandbox</span>}
              </button>
            ))}
          </div>
        )}

        {error && <div className="mt-2 text-[11px] text-ghana-red">{error}</div>}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">
        ONE HEALTH AI can make mistakes and its forecasts are intervals, never certainty. Verify anything that affects patient or public-health decisions.
      </p>
    </div>
  );
}

export const STARTER_PROMPTS: { label: string; prompt: string; mode: AgentMode }[] = [
  {
    label: "National board now",
    prompt: "Give me today's Ghana national signal board with the next-week interval for each signal, then tell me which three need investigation this week and why.",
    mode: "health",
  },
  {
    label: "Deep research: cholera",
    prompt: "Run deep research on cholera risk in Greater Accra over the next 3 months: drivers, recent outbreaks, water and sanitation context, and what GHS and NADMO have published. Cite everything.",
    mode: "research",
  },
  {
    label: "Build a dashboard",
    prompt: "Build a single-file HTML dashboard of Ghana malaria risk by region with a chart and a table, save it as dashboard.html and verify it in the sandbox.",
    mode: "builder",
  },
  {
    label: "Read my file",
    prompt: "Attach a DHIMS2 extract or a photo of a field form and I will pull the structured fields, flag identifiers and say whether it is fit for forecasting.",
    mode: "vision",
  },
];
