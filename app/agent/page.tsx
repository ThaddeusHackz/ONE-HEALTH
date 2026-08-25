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
} from "lucide-react";
import { AgentComposer, STARTER_PROMPTS } from "@/components/agent/AgentComposer";
import { AgentMessage, AskCard } from "@/components/agent/AgentMessage";
import { AgentWorkspace, languageFor, type WorkspaceTab } from "@/components/agent/AgentWorkspace";
import { useAgent, type AgentSettings } from "@/components/agent/useAgent";
import type { SandboxLanguage } from "@/components/agent/SandboxFrame";
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
   * The sandbox is a drawer now, not a permanent column. Closed by default so
   * the conversation gets the full width of the screen; one button slides it in
   * from the right and the same button slides it back out.
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

  /* When the agent draws something in the sandbox, bring the drawer to it. */
  const previewSignature = agent.preview ? `${agent.preview.language}:${agent.preview.code.length}` : "";
  useEffect(() => {
    if (!previewSignature) return;
    setWorkspaceTab("preview");
    setSandboxOpen(true);
  }, [previewSignature]);

  /**
   * A pinned model is used on its own until its credits run out. The server
   * then continues the turn on the Auto chain and tells us, so the dropdown
   * moves back to "Auto (fallback chain)" and the UI stops claiming a pin that
   * is no longer in effect. The Auto chain itself is untouched.
   */
  useEffect(() => {
    const reset = agent.modelReset;
    if (!reset) return;
    patch({ model: "" });
    agent.clearModelReset();
    setResetNotice(
      `${reset.from} ${reset.reason}, so this conversation switched back to the Auto fallback chain.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.modelReset]);

  /* Escape slides the drawer back out. */
  useEffect(() => {
    if (!sandboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSandboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sandboxOpen]);

  const statusChips = useMemo(() => {
    if (!keys) return [];
    return [
      { label: "OpenRouter brain", on: keys.openrouter, icon: Sparkles },
      { label: "Live web (Tavily)", on: keys.search, icon: Search },
      { label: "Image gen (Gemini)", on: keys.imageGen, icon: ImageIcon },
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
                  Add <span className="a-mono">OPENROUTER_API_KEY</span> on Render to switch on reasoning, research and
                  vision; <span className="a-mono">GEMINI_API_KEY</span> switches on image generation.
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

        {/* ------------------------------- centre ------------------------------- */}
        <section className="min-w-0 flex-1">
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
                Reasoning · live web · vision · image generation · in-browser sandbox · charts · diagrams · memory.
                Routed through OpenRouter with automatic multi-model fallback.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={settings.model}
                onChange={(e) => patch({ model: e.target.value })}
                className="a-mono rounded-xl border border-line bg-white px-2 py-1.5 text-[11px]"
                title="Pin one model and it is used on its own until its credits run out, then this returns to Auto automatically. Leave on Auto to walk the fallback chain."
              >
                <option value="">Auto (fallback chain)</option>
                {["openai/gpt-4.1-mini", "google/gemini-2.5-flash", "openai/gpt-4o", "google/gemini-2.5-pro", "anthropic/claude-sonnet-4", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b-instruct:free"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                className={`a-chip ${sandboxOpen ? "!bg-ink !text-white" : ""}`}
                onClick={toggleSandbox}
                title={sandboxOpen ? "Slide the sandbox away" : "Open the sandbox: preview, code, files, console, memory"}
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

          <div
            ref={scrollRef}
            className="a-scroll mx-auto max-w-[76rem] max-h-[calc(100vh-16rem)] min-h-[26rem] space-y-4 overflow-auto pr-1"
          >
            {agent.messages.length === 0 && (
              <div className="a-card a-in p-6">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-ghana-green" />
                  <h2 className="font-display text-2xl tracking-tight">What should we work on?</h2>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
                  This agent reads the live internet, sees images and documents, writes and tests code in an isolated
                  sandbox, generates images, plots live charts, draws flowcharts and diagrams, runs the Ghana ensemble
                  forecasts, and remembers what matters between sessions.
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
                    { icon: Search, title: "Live internet", body: "Tavily search, page reads and multi-step deep research with citations." },
                    { icon: Eye, title: "Vision", body: "Photos, PDFs, Word, Excel, CSV - structured extraction with identifier flagging." },
                    { icon: ImageIcon, title: "Images", body: "Generate new artwork with OpenRouter image models, or pull real Unsplash photography." },
                    { icon: Terminal, title: "Sandbox", body: "JavaScript, HTML, Python (Pyodide), CSS, SVG, Mermaid, CSV - run and verified before you see it." },
                    { icon: Activity, title: "Live data", body: "Ghana ensemble forecasts, national board, z/CUSUM alerts, weather, tables, charts and diagrams." },
                    { icon: Brain, title: "Memory", body: "Facts distilled from each session and replayed into every future turn." },
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

          <div className="mx-auto max-w-[76rem]">
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
      </div>

      {/* --------------------- sandbox drawer (slides from the right) -------------------- */}
      <div
        className={`fixed inset-0 z-[70] ${sandboxOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!sandboxOpen}
      >
        <div
          className={`absolute inset-0 bg-ink/25 backdrop-blur-[2px] transition-opacity duration-300 ${
            sandboxOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setSandboxOpen(false)}
        />
        <div
          className={`absolute right-0 top-0 h-[100dvh] w-[min(60rem,96vw)] shadow-[0_0_80px_rgba(10,16,32,0.28)] transition-transform duration-300 ease-out ${
            sandboxOpen ? "translate-x-0" : "translate-x-full"
          }`}
          role="dialog"
          aria-label="Sandbox workspace"
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
          />
        </div>
      </div>

      {!sandboxOpen && (
        <button
          className="a-glass fixed bottom-24 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold lg:bottom-8"
          onClick={() => setSandboxOpen(true)}
        >
          <PanelRight className="h-4 w-4" /> Sandbox
          {agent.files.length > 0 && (
            <span className="rounded-full bg-green-soft px-1.5 text-[9px] text-ghana-green">{agent.files.length}</span>
          )}
        </button>
      )}

      {!railOpen && (
        <button
          className="a-glass fixed bottom-24 left-5 z-40 flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold"
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
