"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Brain,
  ChevronLeft,
  Eye,
  Image as ImageIcon,
  MessagesSquare,
  PanelRight,
  Plus,
  Radio,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  TriangleAlert,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { AgentComposer, STARTER_PROMPTS } from "@/components/agent/AgentComposer";
import { AgentMessage, AskCard } from "@/components/agent/AgentMessage";
import { AgentWorkspace, languageFor, type WorkspaceTab } from "@/components/agent/AgentWorkspace";
import { useAgent, type AgentSettings } from "@/components/agent/useAgent";
import type { SandboxLanguage } from "@/components/agent/SandboxFrame";
import { PINNABLE_MODELS } from "@/lib/agent/models";
import type { WorkspaceFile } from "@/lib/agent/types";

interface KeyStatus {
  openrouter: boolean;
  search: boolean;
  voice: boolean;
  weather: boolean;
  stockImages: boolean;
  imageGen: boolean;
  lastOpenRouterError: string | null;
}

/**
 * The model dropdown: "Auto (fallback chain)" walks the server chain from
 * openai/gpt-4.1-mini down to the free models; any pinned slug is sent to
 * OpenRouter ALONE - the pinned version is the version that answers.
 */
const MODEL_GROUPS = Array.from(
  PINNABLE_MODELS.reduce((map, m) => {
    const list = map.get(m.group) || [];
    list.push(m);
    map.set(m.group, list);
    return map;
  }, new Map<string, typeof PINNABLE_MODELS>()),
).map(([group, models]) => ({ group, models }));

export default function AgentPage() {
  const agent = useAgent();
  const [settings, setSettings] = useState<AgentSettings>({
    mode: "chat",
    tools: [],
    model: "",
    temperature: 0.4,
    reasoning: false,
  });
  /**
   * The sandbox is a real panel in the page flow now (chat left, workspace
   * right - the arena.ai/agent arrangement), NOT a fixed overlay. The old
   * fixed inset-0 drawer put an invisible layer over the header, which is why
   * the Preview button and everything else "above the sandbox" stopped being
   * clickable while it was open. In-flow, nothing is ever covered.
   */
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("preview");
  const [railOpen, setRailOpen] = useState(true);
  const [focusFile, setFocusFile] = useState<WorkspaceFile | null>(null);
  const [keys, setKeys] = useState<KeyStatus | null>(null);
  const [resetNotice, setResetNotice] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    agent.updateSettings(settings);
  }, [agent, settings]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setKeys(j.capabilities || null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [agent.messages, agent.streaming?.text]);

  /* When the agent draws something in the sandbox, bring the panel to it. */
  const previewSignature = agent.preview ? `${agent.preview.language}:${agent.preview.code.length}` : "";
  useEffect(() => {
    if (!previewSignature) return;
    setWorkspaceTab("preview");
    setSandboxOpen(true);
  }, [previewSignature]);

  /**
   * A pinned model is used on its own until it genuinely cannot serve the
   * turn (credits, authorisation, or the model being unreachable). The server
   * then continues on the Auto chain and tells us, so the dropdown moves back
   * to "Auto (fallback chain)" and the reason is shown - never a silent swap.
   */
  useEffect(() => {
    const reset = agent.modelReset;
    if (!reset) return;
    patch({ model: "" });
    agent.clearModelReset();
    setResetNotice(`${reset.from} ${reset.reason}, so this conversation switched back to the Auto fallback chain.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.modelReset]);

  const lastAnswerModel = useMemo(() => {
    for (let i = agent.messages.length - 1; i >= 0; i -= 1) {
      const m = agent.messages[i];
      if (m.role === "assistant" && m.model) return m.model;
    }
    return "";
  }, [agent.messages]);

  const statusChips = useMemo(() => {
    if (!keys) return [];
    return [
      { label: "OpenRouter brain", on: keys.openrouter, icon: Sparkles },
      { label: "Live web (Tavily)", on: keys.search, icon: Search },
      { label: "Vision + Research + Images (Gemini)", on: keys.imageGen, icon: ImageIcon },
      { label: "Voice (ElevenLabs)", on: keys.voice, icon: Radio },
      { label: "Climate (OpenWeather)", on: keys.weather, icon: Activity },
      { label: "Sandbox", on: true, icon: Terminal },
      { label: "Memory", on: true, icon: Brain },
    ];
  }, [keys]);

  const patch = (p: Partial<AgentSettings>) => setSettings((s) => ({ ...s, ...p }));

  const openPreview = useCallback(
    (p: { language: SandboxLanguage; code: string } | null) => agent.setPreview(p),
    [agent],
  );
  const openFile = useCallback((file: WorkspaceFile) => {
    setFocusFile(file);
    setWorkspaceTab(languageFor(file.language || file.name) === "javascript" ? "code" : "preview");
    setSandboxOpen(true);
  }, []);

  const toggleSandbox = useCallback(() => {
    setSandboxOpen((v) => {
      if (!v) setWorkspaceTab("preview");
      return !v;
    });
  }, []);

  return (
    <div className="agent-shell">
      <div className="mx-auto flex max-w-[132rem] gap-4 px-3 py-4 md:px-5">
        {/* ------------------------------ left rail ------------------------------ */}
        <aside className={`${railOpen ? "hidden w-72 shrink-0 lg:block" : "hidden"}`}>
          <div className="a-glass sticky top-24 space-y-3 rounded-[26px] p-3">
            <button className="a-btn a-btn-primary w-full" onClick={agent.newChat}>
              <Plus className="h-4 w-4" /> New conversation
            </button>

            <div>
              <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">History</div>
              <div className="a-scroll max-h-64 space-y-1 overflow-auto pr-1">
                {agent.conversations.length === 0 && (
                  <p className="px-1 text-[11px] text-muted">Conversations are stored on the server and restored here.</p>
                )}
                {agent.conversations.slice(0, 25).map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-white ${
                      c.id === agent.conversationId ? "bg-white shadow-card" : ""
                    }`}
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => agent.loadConversation(c.id)}>
                      <div className="truncate text-[12px] font-semibold">{c.title}</div>
                      <div className="a-mono text-[10px] text-muted">
                        {c.mode} · {c.turns} msgs · {new Date(c.updatedAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      className="opacity-0 transition group-hover:opacity-100"
                      onClick={() => agent.deleteConversationById(c.id)}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted hover:text-ghana-red" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-line pt-2">
              <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Live keys</div>
              <div className="flex flex-wrap gap-1">
                {statusChips.map((c) => {
                  const Icon = c.icon;
                  return (
                    <span
                      key={c.label}
                      className="a-chip !text-[10px]"
                      data-on={c.on}
                      title={c.on ? `${c.label} connected` : `${c.label} not configured - add the key on Render`}
                    >
                      <Icon className="h-3 w-3" />
                      {c.label}
                      <span className={`h-1.5 w-1.5 rounded-full ${c.on ? "bg-ghana-green" : "bg-ghana-red"}`} />
                    </span>
                  );
                })}
              </div>
              {keys && !keys.openrouter && (
                <p className="mt-2 rounded-xl bg-gold-soft px-2 py-1.5 text-[11px] text-ink">
                  Add <span className="a-mono">OPENROUTER_API_KEY</span> on Render to switch on reasoning;
                  <span className="a-mono">GEMINI_API_KEY</span> switches on vision, deep research and image generation.
                </p>
              )}
            </div>

            <div className="border-t border-line pt-2">
              <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Capabilities ({agent.tools.length})
              </div>
              <div className="a-scroll max-h-56 space-y-1 overflow-auto pr-1">
                {agent.tools.map((t) => (
                  <div key={t.name} className="rounded-xl px-2 py-1 hover:bg-white" title={t.description}>
                    <div className="a-mono text-[11px] font-semibold">
                      {t.name}
                      {t.client && <span className="ml-1 rounded bg-teal-soft px-1 text-[9px] text-teal">sandbox</span>}
                    </div>
                    <div className="text-[10px] leading-4 text-muted">{t.description.slice(0, 96)}…</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* --------------------------- main column --------------------------- */}
        <div className="min-w-0 flex-1">
          {/* header - always on top, always clickable, never covered */}
          <header className="a-glass mb-3 flex flex-wrap items-center gap-3 rounded-[26px] px-4 py-3">
            <button
              className="rounded-full p-1.5 hover:bg-white"
              onClick={() => setRailOpen((v) => !v)}
              aria-label="Toggle history"
              title={railOpen ? "Hide history for more room" : "Show history"}
            >
              <MessagesSquare className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl tracking-tight">
                <span className="a-grad-text">ONE HEALTH AI</span> Agent
              </h1>
              <p className="text-[12px] text-muted">
                Reasoning · live web · Gemini vision &amp; deep research · image generation · sandbox · charts · memory.
                Pin a model or use the Auto fallback chain.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={settings.model}
                onChange={(e) => patch({ model: e.target.value })}
                className="a-mono max-w-[16rem] rounded-xl border border-line bg-white px-2 py-1.5 text-[11px]"
                title="Auto walks the fallback chain from openai/gpt-4.1-mini down. Pin any model and OpenRouter receives that slug alone - the pinned version is the version that answers."
              >
                <option value="">Auto (fallback chain)</option>
                {MODEL_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.models.map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.slug}
                        {m.note ? ` · ${m.note}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {(settings.model || lastAnswerModel) && (
                <span
                  className="a-chip !text-[10px] max-w-[15rem] gap-1"
                  data-on={Boolean(settings.model)}
                  title={
                    settings.model
                      ? `Pinned: every request in this conversation goes to ${settings.model} alone.`
                      : "The model that answered the last turn."
                  }
                >
                  <Zap className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {settings.model ? `pinned: ${settings.model}` : `answering: ${lastAnswerModel}`}
                  </span>
                </span>
              )}
              <button
                className={`a-chip ${sandboxOpen ? "!bg-ink !text-white" : ""}`}
                onClick={toggleSandbox}
                title={sandboxOpen ? "Hide the sandbox panel" : "Open the sandbox: preview, code, files, console, memory"}
                aria-expanded={sandboxOpen}
              >
                <PanelRight className="h-3.5 w-3.5" /> Sandbox
                {agent.files.length > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[9px] ${
                      sandboxOpen ? "bg-white/20 text-white" : "bg-green-soft text-ghana-green"
                    }`}
                  >
                    {agent.files.length}
                  </span>
                )}
              </button>
              <button className="a-chip" onClick={agent.exportTranscript} title="Download this conversation as markdown">
                Export
              </button>
            </div>
          </header>

          {/* chat + workspace side by side, all in the page flow (no overlay) */}
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* ------------------------------ chat ------------------------------ */}
            <section className="min-w-0 flex-1">
              <div
                ref={scrollRef}
                className="a-scroll mx-auto max-h-[calc(100vh-16rem)] min-h-[26rem] space-y-4 overflow-auto pr-1"
              >
                {agent.messages.length === 0 && (
                  <div className="a-card a-in p-6">
                    <div className="flex items-center gap-2">
                      <Wand2 className="h-5 w-5 text-ghana-green" />
                      <h2 className="font-display text-2xl tracking-tight">What should we work on?</h2>
                    </div>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
                      This agent reads the live internet, sees images and documents through the Gemini vision engine,
                      writes and tests code in an isolated sandbox, generates images, plots live charts, draws diagrams,
                      runs the Ghana ensemble forecasts, accepts workspace files up to 2 GB, and remembers what matters
                      between sessions.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {STARTER_PROMPTS.map((s) => (
                        <button
                          key={s.label}
                          className="a-card p-3 text-left transition hover:-translate-y-0.5"
                          onClick={() => {
                            patch({ mode: s.mode });
                            void agent.send({ text: s.prompt });
                          }}
                        >
                          <div className="text-[13px] font-semibold">{s.label}</div>
                          <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{s.prompt}</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {[
                        { icon: Search, title: "Live internet", body: "Tavily search, page reads and multi-step deep research with citations, synthesised on Gemini." },
                        { icon: Eye, title: "Gemini vision", body: "Photos, PDFs, Word, Excel, CSV - read by the Gemini engine in every mode: chat, builder, research, One Health." },
                        { icon: ImageIcon, title: "Images", body: "Generate new artwork on the Gemini image models, or pull real Unsplash photography." },
                        { icon: Terminal, title: "Sandbox", body: "JavaScript, HTML, Python (Pyodide), CSS, SVG, Mermaid, CSV - run, verified and previewed before you see it." },
                        { icon: Activity, title: "Live data", body: "Ghana ensemble forecasts, national board, z/CUSUM alerts, weather, tables, charts and diagrams." },
                        { icon: Brain, title: "Memory + files", body: "Facts distilled each session, replayed every turn; workspace uploads up to 2 GB per file." },
                      ].map((c) => {
                        const Icon = c.icon;
                        return (
                          <div key={c.title} className="rounded-2xl border border-line bg-white/70 p-3">
                            <Icon className="h-4 w-4 text-ghana-green" />
                            <div className="mt-1 text-[12px] font-semibold">{c.title}</div>
                            <div className="text-[11px] leading-5 text-muted">{c.body}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {agent.messages.map((m, i) => (
                  <AgentMessage
                    key={m.id}
                    message={m}
                    onOpenFile={openFile}
                    streaming={i === agent.messages.length - 1 && m.role === "assistant" ? agent.streaming : null}
                  />
                ))}

                {agent.pendingAsk && (
                  <AskCard
                    question={agent.pendingAsk.question}
                    options={agent.pendingAsk.options}
                    onAnswer={(a) => agent.answerAsk(a)}
                    onCancel={() => agent.answerAsk("Use your best judgement and continue.")}
                  />
                )}

                {resetNotice && (
                  <div className="a-card a-in ml-12 flex items-start gap-2 border-teal-soft p-3 text-[12px]">
                    <span className="a-dot mt-1 h-2 w-2 shrink-0 rounded-full bg-teal" />
                    <span className="flex-1">{resetNotice}</span>
                    <button className="text-muted hover:text-ink" onClick={() => setResetNotice("")} aria-label="Dismiss">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {agent.notice && (
                  <div className="a-card a-in ml-12 flex items-start gap-2 border-gold-soft p-3 text-[12px]">
                    <span className="a-dot mt-1 h-2 w-2 shrink-0 rounded-full bg-ghana-gold" />
                    <span>{agent.notice}</span>
                  </div>
                )}

                {agent.error && (
                  <div className="a-card a-in ml-12 flex items-start gap-2 border-red-soft p-3 text-[12px] text-ghana-red">
                    <TriangleAlert className="mt-0.5 h-4 w-4" />
                    <span>{agent.error}</span>
                  </div>
                )}
              </div>

              <div className="mx-auto">
                <AgentComposer
                  onSend={(input) => agent.send(input)}
                  busy={agent.busy}
                  onStop={agent.stop}
                  tools={agent.tools}
                  settings={settings}
                  onSettings={patch}
                />
              </div>
            </section>

            {/* --------------------------- sandbox panel --------------------------- */}
            {sandboxOpen && (
              <aside
                id="ohg-sandbox"
                className="order-last h-[72vh] w-full shrink-0 lg:order-none lg:h-[calc(100vh-13.5rem)] lg:w-[min(54rem,46vw)]"
              >
                <AgentWorkspace
                  onClose={() => setSandboxOpen(false)}
                  tab={workspaceTab}
                  onTab={setWorkspaceTab}
                  preview={agent.preview}
                  onPreview={openPreview}
                  files={agent.files}
                  onDeleteFile={(name) => agent.deleteWorkspaceFile(name)}
                  onSaveFile={(name, content, language) => agent.writeWorkspaceFile(name, content, language)}
                  logs={agent.logs}
                  onLog={agent.pushLog}
                  facts={agent.facts}
                  onSaveFact={(text, tag) => agent.saveFact(text, tag)}
                  onDropFact={(id) => agent.dropFact(id)}
                  onClearMemory={agent.clearMemory}
                  sandboxReady={agent.setSandbox}
                  focusFile={focusFile}
                  onFilesChanged={agent.refreshSideData}
                />
              </aside>
            )}
          </div>
        </div>
      </div>

      {!railOpen && (
        <button
          className="a-glass fixed bottom-24 left-5 z-40 flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold lg:bottom-8"
          onClick={() => setRailOpen(true)}
        >
          <ChevronLeft className="h-4 w-4" /> History
        </button>
      )}

      <div className="mx-auto max-w-[132rem] px-5 pb-8">
        <p className="a-mono text-[11px] text-muted">
          Built for the Ghana Health Service. Forecasts are intervals, never certainty. Need the classic desks?{" "}
          <Link href="/forecast" className="text-ghana-green underline">
            Forecast
          </Link>{" "}
          ·{" "}
          <Link href="/vision" className="text-ghana-green underline">
            Vision Lab
          </Link>{" "}
          ·{" "}
          <Link href="/intelligence" className="text-ghana-green underline">
            Intelligence
          </Link>
        </p>
      </div>
    </div>
  );
}
