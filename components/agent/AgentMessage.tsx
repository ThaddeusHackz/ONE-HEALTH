"use client";

import { useState } from "react";
import {
  Braces,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Image as ImageIcon,
  Link2,
  ListChecks,
  PieChart as PieIcon,
  Search,
  Sparkles,
  Table as TableIcon,
  Terminal,
  TriangleAlert,
  Workflow,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import type { AgentEvent, ChartSpec, Citation, DiagramSpec, TableSpec, WorkspaceFile } from "@/lib/agent/types";
import type { UiMessage } from "@/lib/agent/types";
import { AgentChart, AgentTable } from "./Charts";
import { Diagram } from "./Diagram";
import { SpeakButton } from "./Voice";

const TOOL_ICON: Record<string, typeof Search> = {
  web_search: Search,
  web_fetch: Link2,
  image_search: ImageIcon,
  image_generate: ImageIcon,
  vision_read: ImageIcon,
  create_file: FileCode2,
  list_files: FileCode2,
  read_file: FileCode2,
  delete_file: FileCode2,
  sandbox_exec: Terminal,
  chart: PieIcon,
  table: TableIcon,
  diagram: Workflow,
  compute: Braces,
  ghana_forecast: PieIcon,
  ghana_national_table: TableIcon,
  weather_now: Sparkles,
  deep_research: Brain,
  memory_save: Brain,
  memory_recall: Brain,
  plan: ListChecks,
  ask_user: Sparkles,
  current_time: Sparkles,
};

function ToolRow({ event }: { event: AgentEvent }) {
  const [open, setOpen] = useState(false);
  const ok = event.type !== "tool_error";
  const name = String(event.name || "tool");
  const Icon = TOOL_ICON[name] || Braces;
  const output = String(event.output || "");
  return (
    <div className="a-tool rounded-r-xl px-3 py-2" data-ok={ok ? "true" : "false"}>
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
        <Icon className="h-3.5 w-3.5 text-ghana-green" />
        <span className="a-mono text-[11px] font-semibold text-ink">{name}</span>
        {ok ? (
          <Check className="h-3 w-3 text-ghana-green" />
        ) : (
          <TriangleAlert className="h-3 w-3 text-ghana-red" />
        )}
        <span className="a-mono flex-1 truncate text-[11px] text-muted">{output.split("\n")[0]}</span>
      </button>
      {open && (
        <pre className="a-mono a-scroll mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 text-[11px] text-muted">
          {output || "(no output)"}
        </pre>
      )}
    </div>
  );
}

function CitationRow({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.slice(0, 10).map((c, i) => (
        <a
          key={`${c.url}-${i}`}
          href={c.url}
          target="_blank"
          rel="noreferrer noopener"
          className="a-chip !text-[11px]"
          title={c.snippet || c.url}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ghana-green/10 text-[9px] font-bold text-ghana-green">
            {i + 1}
          </span>
          <span className="max-w-[14rem] truncate">{c.title || c.url}</span>
        </a>
      ))}
    </div>
  );
}

function FileCard({ file, onOpen }: { file: WorkspaceFile; onOpen?: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="a-card a-in flex w-full max-w-md items-center gap-3 p-3 text-left transition hover:-translate-y-0.5"
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-green-soft text-ghana-green">
        <FileCode2 className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{file.name}</div>
        <div className="a-mono text-[11px] text-muted">
          {file.language} · {(file.bytes || file.content?.length || 0).toLocaleString()} bytes
        </div>
      </div>
      <span className="text-[11px] font-semibold text-ghana-green">Open →</span>
    </button>
  );
}

function PlanCard({ steps }: { steps: string[] }) {
  return (
    <ol className="a-card a-in mt-2 space-y-1 p-3 text-sm">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">
            {i + 1}
          </span>
          <span className="text-muted">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function AgentMessage({
  message,
  onOpenFile,
  streaming,
}: {
  message: UiMessage;
  onOpenFile?: (file: WorkspaceFile) => void;
  streaming?: { text: string; reasoning: string } | null;
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = message.role === "user";
  const body = isUser ? message.content : message.content || streaming?.text || "";
  const reasoning = message.reasoning || streaming?.reasoning || "";
  const live = !message.content && Boolean(streaming);

  return (
    <article className={`a-in flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-ghana-green to-teal text-white shadow-card">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
      )}

      <div className={`min-w-0 max-w-[min(52rem,100%)] ${isUser ? "order-first" : ""}`}>
        {isUser ? (
          <div className="a-bubble-user px-4 py-3">
            <p className="whitespace-pre-wrap text-[0.92rem] leading-7">{message.content}</p>
            {message.attachments?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.attachments.map((a) =>
                  a.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={a.name} src={a.dataUrl} alt={a.name} className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/20" />
                  ) : (
                    <span key={a.name} className="a-mono rounded-lg bg-white/10 px-2 py-1 text-[11px]">
                      {a.name}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="a-bubble-ai px-4 py-3">
            {reasoning && (
              <button
                className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted"
                onClick={() => setShowReasoning((v) => !v)}
              >
                <Brain className="h-3.5 w-3.5" />
                {showReasoning ? "Hide reasoning" : `Reasoning (${reasoning.length} chars)`}
              </button>
            )}
            {reasoning && showReasoning && (
              <pre className="a-mono a-scroll mb-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 text-[11px] text-muted">
                {reasoning}
              </pre>
            )}

            {message.events.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {message.events.map((event, i) => {
                  if (event.type === "tool_start") return null;
                  if (event.type === "tool_result" || event.type === "tool_error") {
                    return <ToolRow key={i} event={event} />;
                  }
                  if (event.type === "citations") {
                    return <CitationRow key={i} citations={(event.citations as Citation[]) || []} />;
                  }
                  if (event.type === "plan") {
                    return <PlanCard key={i} steps={(event.steps as string[]) || []} />;
                  }
                  if (event.type === "chart") {
                    return <AgentChart key={i} spec={event.chart as ChartSpec} />;
                  }
                  if (event.type === "table") {
                    return <AgentTable key={i} spec={event.table as TableSpec} />;
                  }
                  if (event.type === "diagram") {
                    return <Diagram key={i} spec={event.diagram as DiagramSpec} live={live} />;
                  }
                  if (event.type === "file") {
                    return <FileCard key={i} file={event.file as WorkspaceFile} onOpen={() => onOpenFile?.(event.file as WorkspaceFile)} />;
                  }
                  if (event.type === "image") {
                    const image = event.image as { dataUrl: string; prompt: string; model: string };
                    return (
                      <figure key={i} className="a-card a-in overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.dataUrl} alt={image.prompt} className="max-h-96 w-full object-contain bg-paper" />
                        <figcaption className="a-mono flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11px] text-muted">
                          <span className="truncate">{image.prompt}</span>
                          <a href={image.dataUrl} download="one-health-ai-image.png" className="shrink-0 font-semibold text-ghana-green">
                            download
                          </a>
                        </figcaption>
                      </figure>
                    );
                  }
                  if (event.type === "stock") {
                    const images = (event.images as { url: string; alt: string; author?: string }[]) || [];
                    return (
                      <div key={i} className="a-in grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {images.slice(0, 6).map((img) => (
                          <a key={img.url} href={img.url} target="_blank" rel="noreferrer noopener" className="a-card overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url} alt={img.alt} loading="lazy" className="h-24 w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    );
                  }
                  if (event.type === "memory") {
                    const fact = event.fact as { text: string; tag: string };
                    return (
                      <div key={i} className="a-in flex items-center gap-2 rounded-xl bg-gold-soft px-3 py-2 text-[12px]">
                        <Brain className="h-3.5 w-3.5 text-ghana-gold" />
                        <span className="text-ink">Remembered ({fact?.tag}): {fact?.text}</span>
                      </div>
                    );
                  }
                  if (event.type === "sandbox_request") {
                    return (
                      <div key={i} className="a-in a-code">
                        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-white/70">
                          <span className="flex items-center gap-1.5">
                            <Terminal className="h-3.5 w-3.5" /> sandbox · {String(event.language || "javascript")}
                          </span>
                          <span>{String(event.filename || "")}</span>
                        </div>
                        <pre>{String(event.code || "").slice(0, 1600)}</pre>
                      </div>
                    );
                  }
                  if (event.type === "sandbox_result") {
                    return (
                      <div key={i} className="a-in a-code">
                        <div className="px-3 py-2 text-[11px] text-white/70">sandbox output</div>
                        <pre>{String(event.output || "").slice(0, 1600)}</pre>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {body ? (
              <div className={`prose-agent prose-ghana ${live ? "a-caret" : ""}`}>
                <Markdown text={body} live={live} />
              </div>
            ) : live ? (
              <div className="space-y-2">
                <div className="a-shimmer h-3 w-3/4" />
                <div className="a-shimmer h-3 w-1/2" />
              </div>
            ) : null}

            {!live && body && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
                <SpeakButton text={body} />
                <button
                  className="a-chip"
                  onClick={() => navigator.clipboard?.writeText(body)}
                  title="Copy answer"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                {message.model && <span className="a-mono text-[10px] text-muted">{message.model}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-ink text-white">
          <span className="text-xs font-bold">You</span>
        </div>
      )}
    </article>
  );
}

export function StatusLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 pl-12 text-[11px] text-muted">
      <span className="a-dot h-1.5 w-1.5 rounded-full bg-ghana-green" />
      {text}
    </div>
  );
}

export function AskCard({
  question,
  options,
  onAnswer,
  onCancel,
}: {
  question: string;
  options: string[];
  onAnswer: (answer: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="a-card a-in ml-12 max-w-xl border-gold-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ghana-gold">The agent needs an answer</div>
          <p className="mt-1 text-sm">{question}</p>
        </div>
        <button onClick={onCancel} className="text-muted hover:text-ink" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} className="a-chip" onClick={() => onAnswer(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
