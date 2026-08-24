"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentAttachment, AgentEvent, AgentMode, UiMessage, WorkspaceFile } from "@/lib/agent/types";
import type { SandboxHandle, SandboxLanguage } from "./SandboxFrame";

export interface ToolInfo {
  name: string;
  description: string;
  client: boolean;
}

export interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  updatedAt: string;
  turns: number;
}

export interface MemoryFactLite {
  id: string;
  text: string;
  tag: string;
  updatedAt: string;
  hits: number;
}

export interface PendingAsk {
  callId: string;
  question: string;
  options: string[];
  messages: unknown[];
}

export interface AgentSettings {
  mode: AgentMode;
  tools: string[];
  model: string;
  temperature: number;
  reasoning: boolean;
}

type PendingClientCall = { name: string; payload: Record<string, unknown> };

/** One decoded SSE frame from /api/agent. */
interface StreamFrame {
  text?: string;
  name?: string;
  output?: string;
  language?: string;
  code?: string;
  filename?: string;
  file?: WorkspaceFile;
  message?: string;
  model?: string;
  conversationId?: string;
  pending?: {
    callId?: string;
    name?: string;
    payload?: { question?: string; options?: string[]; code?: string; language?: string };
    messages?: unknown[];
  };
  [key: string]: unknown;
}

const STORAGE_KEY = "ohg.agent.session.v1";

/**
 * A Render free instance that has been idle 15 minutes answers the first request
 * with an HTML "Application loading" page (HTTP 200) while it spins up - about a
 * minute. Without this the client would silently show an empty answer, so we
 * detect the loading page, say so, and retry.
 */
const COLD_START_WAITS = [15000, 20000, 25000];

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useAgent() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState<{ text: string; reasoning: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [facts, setFacts] = useState<MemoryFactLite[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [configured, setConfigured] = useState(true);
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);
  const [logs, setLogs] = useState<{ level: string; text: string }[]>([]);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{ language: SandboxLanguage; code: string } | null>(null);

  const sandboxRef = useRef<SandboxHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingCallRef = useRef<PendingClientCall | null>(null);
  const settingsRef = useRef<AgentSettings>({ mode: "chat", tools: [], model: "", temperature: 0.4, reasoning: false });
  const conversationRef = useRef<string | null>(null);
  const messagesRef = useRef<UiMessage[]>([]);

  useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const refreshSideData = useCallback(async () => {
    try {
      const [mem, file] = await Promise.all([
        fetch("/api/agent/memory").then((r) => r.json()),
        fetch("/api/agent/files").then((r) => r.json()),
      ]);
      setConversations(mem.conversations || []);
      setFacts(mem.facts || []);
      setFiles(file.files || []);
    } catch {
      /* side panels simply stay empty */
    }
  }, []);

  useEffect(() => {
    fetch("/api/agent")
      .then((r) => r.json())
      .then((j) => {
        setTools(j.tools || []);
        setConfigured(Boolean(j.configured));
        settingsRef.current.tools = (j.tools || []).map((t: ToolInfo) => t.name);
      })
      .catch(() => undefined);
    void refreshSideData();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { messages: UiMessage[]; conversationId: string | null };
        if (Array.isArray(saved.messages) && saved.messages.length) {
          setMessages(saved.messages);
          setConversationId(saved.conversationId || null);
        }
      }
    } catch {
      /* fresh session */
    }
  }, [refreshSideData]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-40), conversationId }));
    } catch {
      /* storage full - keep going in memory */
    }
  }, [messages, conversationId]);

  const setSandbox = useCallback((handle: SandboxHandle) => {
    sandboxRef.current = handle;
  }, []);

  const pushLog = useCallback((line: { level: string; text: string }) => {
    setLogs((prev) => [...prev.slice(-240), line]);
  }, []);

  /* ------------------------------- streaming ---------------------------- */

  const openStream = useCallback(
    async (payload: Record<string, unknown>, controller: AbortController): Promise<Response> => {
      const body = JSON.stringify(payload);
      let lastError = "";
      for (let attempt = 0; ; attempt += 1) {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        const ctype = res.headers.get("content-type") || "";
        if (res.ok && ctype.includes("text/event-stream")) {
          setNotice("");
          return res;
        }
        const text = await res.text().catch(() => "");
        lastError = text;
        const coldStart =
          res.ok && (!ctype || /text\/html/i.test(ctype) || /Render|Application loading|spinning up/i.test(text));
        if (!coldStart || attempt >= COLD_START_WAITS.length) {
          throw new Error(
            res.status === 413
              ? `Request too large. Attach fewer or smaller files. ${text.slice(0, 160)}`
              : `Agent request failed (${res.status}) ${text.slice(0, 200)}`,
          );
        }
        setNotice(
          `The server was asleep (Render free tier spins down after 15 idle minutes). Waking it - attempt ${
            attempt + 1
          } of ${COLD_START_WAITS.length}, cold start takes about a minute…`,
        );
        await new Promise((resolve) => setTimeout(resolve, COLD_START_WAITS[attempt]));
        if (controller.signal.aborted) throw new Error("Stopped");
      }
    },
    [],
  );

  const consume = useCallback(async (payload: Record<string, unknown>, targetId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const res = await openStream(payload, controller);
    if (!res.body) {
      throw new Error("Agent stream returned no body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalText = "";
    let finalModel = "";
    let pending: PendingAsk | null = null;
    let newConversationId = "";

    const patch = (fn: (m: UiMessage) => UiMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === targetId ? fn(m) : m)));

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      for (const frame of frames) {
        if (!frame.trim()) continue;
        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        let parsed: StreamFrame = {};
        try {
          parsed = JSON.parse(data) as StreamFrame;
        } catch {
          continue;
        }
        const evt: AgentEvent = { type: event as AgentEvent["type"], ...parsed };

        switch (event) {
          case "delta":
            finalText += String(parsed.text || "");
            setStreaming((s) => ({ text: (s?.text || "") + String(parsed.text || ""), reasoning: s?.reasoning || "" }));
            break;
          case "reasoning":
            setStreaming((s) => ({ text: s?.text || "", reasoning: (s?.reasoning || "") + String(parsed.text || "") }));
            break;
          case "tool_result":
          case "tool_error":
            patch((m) => ({
              ...m,
              events: [...m.events, evt],
              toolLog: [
                ...(m.toolLog || []),
                { name: String(parsed.name || ""), ok: event === "tool_result", summary: String(parsed.output || "").slice(0, 140) },
              ],
            }));
            break;
          case "sandbox_request":
          case "ask":
            pendingCallRef.current = {
              name:
                typeof parsed.name === "string" && parsed.name
                  ? parsed.name
                  : event === "ask"
                    ? "ask_user"
                    : "sandbox_exec",
              payload: parsed as Record<string, unknown>,
            };
            patch((m) => ({ ...m, events: [...m.events, evt] }));
            if (event === "sandbox_request") {
              setPreview({ language: (parsed.language || "javascript") as SandboxLanguage, code: String(parsed.code || "") });
            }
            break;
          case "file":
            patch((m) => ({ ...m, events: [...m.events, evt] }));
            setFiles((prev) => {
              const incoming = parsed.file as WorkspaceFile;
              return [incoming, ...prev.filter((f) => f.name !== incoming?.name)].slice(0, 60);
            });
            break;
          case "sandbox_result":
            patch((m) => ({ ...m, events: [...m.events, evt] }));
            pushLog({ level: "info", text: `sandbox → ${String(parsed.output || "").slice(0, 200)}` });
            break;
          case "error":
            setError(String(parsed.message || "Agent error"));
            break;
          case "result":
            finalText = typeof parsed.text === "string" && parsed.text ? parsed.text : finalText;
            finalModel = String(parsed.model || "") || finalModel;
            newConversationId = String(parsed.conversationId || "") || newConversationId;
            if (parsed.pending) {
              pending = {
                callId: String(parsed.pending.callId),
                question: String(parsed.pending.payload?.question || ""),
                options: Array.isArray(parsed.pending.payload?.options) ? parsed.pending.payload.options : [],
                messages: parsed.pending.messages || [],
              };
            }
            break;
          default:
            patch((m) => ({ ...m, events: [...m.events, evt] }));
            break;
        }
      }
    }

    patch((m) => ({ ...m, content: finalText || m.content, model: finalModel || m.model }));
    if (newConversationId) setConversationId(newConversationId);

    return { pending, finalText, finalModel };
  }, [openStream, pushLog]);

  /* --------------------------- sandbox handshake ------------------------ */

  const runPending = useCallback(
    async (
      pending: PendingAsk,
      turns: { role: "user" | "assistant"; content: string }[],
      targetId: string,
    ): Promise<void> => {
      const call = pendingCallRef.current || { name: "sandbox_exec", payload: {} };

      if (call.name === "ask_user") {
        setPendingAsk({ ...pending, question: pending.question || String(call.payload.question || "") , options: pending.options.length ? pending.options : (call.payload.options as string[]) || [] });
        setBusy(false);
        setStreaming(null);
        return;
      }

      let output: string;
      const sandbox = sandboxRef.current;
      if (!sandbox) {
        output = "Sandbox unavailable in this browser session.";
      } else {
        try {
          const result = await sandbox.run({
            callId: pending.callId,
            code: String(call.payload.code || ""),
            language: (String(call.payload.language || "javascript") as SandboxLanguage),
          });
          output = [
            `exit: ${result.ok ? 0 : 1}`,
            result.stdout ? `stdout:\n${result.stdout}` : "",
            result.result ? `return value:\n${result.result}` : "",
            result.error ? `error:\n${result.error}` : "",
            `elapsed: ${result.ms}ms`,
          ]
            .filter(Boolean)
            .join("\n");
        } catch (err) {
          output = `Sandbox error: ${(err as Error).message}`;
        }
      }

      const settings = settingsRef.current;
      const next = await consume(
        {
          turns,
          mode: settings.mode,
          tools: settings.tools.length ? settings.tools : undefined,
          model: settings.model || undefined,
          temperature: settings.temperature,
          reasoning: settings.reasoning,
          conversationId: conversationRef.current || undefined,
          resume: { messages: pending.messages, callId: pending.callId, output: output.slice(0, 12000) },
        },
        targetId,
      );

      if (next.pending) {
        await runPending(next.pending, turns, targetId);
        return;
      }
      setBusy(false);
      setStreaming(null);
      void refreshSideData();
    },
    [consume, refreshSideData],
  );

  /* --------------------------------- send ------------------------------- */

  const send = useCallback(
    async (input: { text: string; attachments?: AgentAttachment[] }) => {
      const text = input.text.trim();
      if (!text && !(input.attachments || []).length) return;
      setError("");
      setBusy(true);
      setStreaming({ text: "", reasoning: "" });

      const assistantId = uid("a");
      const turns = [
        ...messagesRef.current.filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text || "(attachment)" },
      ];

      setMessages((prev) => [
        ...prev,
        {
          id: uid("u"),
          role: "user",
          content: text || "(attachment)",
          at: new Date().toISOString(),
          events: [],
          attachments: input.attachments,
        },
        { id: assistantId, role: "assistant", content: "", at: new Date().toISOString(), events: [], toolLog: [] },
      ]);

      const settings = settingsRef.current;
      try {
        const outcome = await consume(
          {
            turns,
            mode: settings.mode,
            tools: settings.tools.length ? settings.tools : undefined,
            model: settings.model || undefined,
            temperature: settings.temperature,
            reasoning: settings.reasoning,
            conversationId: conversationRef.current || undefined,
            attachments: input.attachments,
          },
          assistantId,
        );
        if (outcome.pending) {
          await runPending(outcome.pending, turns, assistantId);
          return;
        }
        void refreshSideData();
      } catch (err) {
        const message = (err as Error).message || "";
        if (!/abort/i.test(message)) {
          setError(message);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content || `⚠️ ${message}` } : m)),
          );
        }
      } finally {
        setBusy(false);
        setStreaming(null);
      }
    },
    [consume, refreshSideData, runPending],
  );

  const answerAsk = useCallback(
    async (answer: string) => {
      const pending = pendingAsk;
      setPendingAsk(null);
      if (!pending) return;
      setBusy(true);
      const assistantId = uid("a");
      const turns = [
        ...messagesRef.current.filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: answer },
      ];
      setMessages((prev) => [
        ...prev,
        { id: uid("u"), role: "user", content: answer, at: new Date().toISOString(), events: [] },
        { id: assistantId, role: "assistant", content: "", at: new Date().toISOString(), events: [], toolLog: [] },
      ]);
      const settings = settingsRef.current;
      try {
        const outcome = await consume(
          {
            turns,
            mode: settings.mode,
            tools: settings.tools.length ? settings.tools : undefined,
            conversationId: conversationRef.current || undefined,
            resume: { messages: pending.messages, callId: pending.callId, output: answer },
          },
          assistantId,
        );
        if (outcome.pending) await runPending(outcome.pending, turns, assistantId);
        else void refreshSideData();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
        setStreaming(null);
      }
    },
    [consume, pendingAsk, refreshSideData, runPending],
  );

  /* ------------------------------ management ---------------------------- */

  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setStreaming(null);
    setError("");
    setPendingAsk(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const json = await fetch(`/api/agent/memory?conversation=${encodeURIComponent(id)}`).then((r) => r.json());
    const conversation = json.conversation as { messages?: { role: string; content: string; at?: string; model?: string }[] } | undefined;
    if (!conversation) return;
    setConversationId(id);
    setMessages(
      (conversation.messages || [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: uid(m.role),
          role: m.role as "user" | "assistant",
          content: m.content,
          model: m.model,
          at: m.at || new Date().toISOString(),
          events: [],
        })),
    );
  }, []);

  const deleteConversationById = useCallback(
    async (id: string) => {
      await fetch("/api/agent/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteConversation", id }),
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationRef.current === id) newChat();
    },
    [newChat],
  );

  const saveFact = useCallback(
    async (fact: string, tag = "general") => {
      await fetch("/api/agent/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact, tag }),
      });
      void refreshSideData();
    },
    [refreshSideData],
  );

  const dropFact = useCallback(
    async (id: string) => {
      await fetch("/api/agent/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      void refreshSideData();
    },
    [refreshSideData],
  );

  const clearMemory = useCallback(async () => {
    await fetch("/api/agent/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    void refreshSideData();
  }, [refreshSideData]);

  const writeWorkspaceFile = useCallback(
    async (name: string, content: string, language?: string) => {
      await fetch("/api/agent/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content, language }),
      });
      void refreshSideData();
    },
    [refreshSideData],
  );

  const deleteWorkspaceFile = useCallback(
    async (name: string) => {
      await fetch("/api/agent/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delete: name }),
      });
      setFiles((prev) => prev.filter((f) => f.name !== name));
      void refreshSideData();
    },
    [refreshSideData],
  );

  /** Aborts the in-flight stream; the partial answer already rendered stays on screen. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStreaming(null);
    setPendingAsk(null);
    setNotice("");
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      if (last.content.trim()) return prev;
      const trimmed = prev.slice(0, -1);
      return trimmed.length
        ? trimmed.map((m, i) => (i === trimmed.length - 1 && m.role === "assistant" ? { ...m, content: m.content || "_Stopped._" } : m))
        : trimmed;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<AgentSettings>) => {
    settingsRef.current = { ...settingsRef.current, ...patch };
  }, []);

  const exportTranscript = useCallback(() => {
    const lines = messagesRef.current
      .filter((m) => m.content.trim())
      .map((m) => `## ${m.role === "user" ? "You" : "ONE HEALTH AI"}${m.model ? ` · ${m.model}` : ""}\n\n${m.content}`);
    const blob = new Blob([`# ONE HEALTH AI transcript\n\n${lines.join("\n\n---\n\n")}\n`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `one-health-ai-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    messages,
    streaming,
    busy,
    error,
    conversationId,
    conversations,
    facts,
    files,
    tools,
    configured,
    pendingAsk,
    logs,
    notice,
    preview,
    setPreview,
    setSandbox,
    pushLog,
    send,
    answerAsk,
    newChat,
    loadConversation,
    deleteConversationById,
    saveFact,
    dropFact,
    clearMemory,
    writeWorkspaceFile,
    deleteWorkspaceFile,
    updateSettings,
    refreshSideData,
    exportTranscript,
    stop,
  };
}

export type AgentController = ReturnType<typeof useAgent>;
