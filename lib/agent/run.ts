import { agentMaxSteps, openRouterKey } from "@/lib/env";
import {
  completeStream,
  openRouterConfigured,
  type ChatMessage,
  type ContentPart,
  type ToolCallWire,
} from "@/lib/openrouter";
import { redactText } from "@/lib/redact";
import { isCreditError, isFatalAuth } from "@/lib/openrouter";
import { isGeminiQuotaError } from "./gemini";
import { recordAudit } from "@/lib/store";
import { AGENT_SYSTEM_PROMPT, isClientTool, runTool, toolSpecs, type ToolContext } from "./tools";
import { distillMemory, recallFacts, upsertConversation } from "./memory";
import type { AgentAttachment, AgentEvent, AgentMode } from "./types";

export interface AgentTurn {
  role: "user" | "assistant";
  content: string;
  attachments?: AgentAttachment[];
}

export interface PendingClientCall {
  callId: string;
  name: string;
  payload: Record<string, unknown>;
  messages: ChatMessage[];
}

export interface AgentRunResult {
  text: string;
  reasoning?: string;
  model: string;
  conversationId: string;
  toolLog: { name: string; ok: boolean; summary: string }[];
  pending?: PendingClientCall;
  factsAdded: number;
}

export interface AgentRunInput {
  turns: AgentTurn[];
  mode: AgentMode;
  allowedTools: string[];
  model?: string;
  temperature?: number;
  reasoning?: boolean;
  conversationId?: string;
  /** Client-side tool result from a previous paused turn. */
  resume?: { messages: ChatMessage[]; callId: string; output: string; priorText?: string };
  emit: (event: AgentEvent) => void;
}

const MODE_HINT: Record<AgentMode, string> = {
  chat: "Mode: general assistant. Be concise; use tools only when they add real value.",
  research:
    "Mode: Deep Research. Always plan, then use web_search / web_fetch / deep_research, then deliver a structured, fully cited brief.",
  builder:
    "Mode: Builder. You are producing a working artefact, so work like an engineer:\n" +
    "1. plan the build, then create_file the deliverable in full - never a fragment, never a diff, never \"rest of code here\".\n" +
    "2. Verify it before you claim it works: sandbox_exec the same code (language javascript for logic, html for a page) and read the real stdout/return value.\n" +
    "3. If the run fails, fix the file, create_file it again and re-run. Iterate until it passes; report the exact output you observed.\n" +
    "4. Pass filename to sandbox_exec (or use create_file) so the artefact lands in the workspace and the user can download it.\n" +
    "5. Prefer one self-contained file (inline CSS and JS, no build step, no external assets) so the preview actually renders.\n" +
    "6. Finish with: what you built, how you verified it, and where the file is.",
  vision:
    "Mode: Vision. The user attached files. Call vision_read FIRST - it runs the attachments through the Gemini vision engine and returns exactly what is in them. Work only from what vision_read reports; never invent content that is not visible.",
  health:
    "Mode: One Health desk. Lead with ghana_forecast / ghana_national_table / weather_now, pair human, animal and environmental signals, and keep every number inside an interval.",
};

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const emit = input.emit;
  const toolLog: { name: string; ok: boolean; summary: string }[] = [];
  const lastTurn = [...input.turns].reverse().find((t) => t.role === "user");
  const userText = lastTurn?.content || "";
  const hasAttachments = input.turns.some((t) => (t.attachments || []).length > 0);

  if (!openRouterConfigured()) {
    const text = offlineNotice();
    emit({ type: "delta", text });
    emit({ type: "done", model: "offline", text });
    const conversation = upsertConversation({
      id: input.conversationId,
      mode: input.mode,
      model: "offline",
      messages: [
        { role: "user", content: userText, at: new Date().toISOString() },
        { role: "assistant", content: text, model: "offline", at: new Date().toISOString() },
      ],
    });
    return { text, model: "offline", conversationId: conversation.id, toolLog, factsAdded: 0 };
  }

  /* ---- resume: the browser answered a sandbox_exec / ask_user call ---- */
  if (input.resume) {
    const messages: ChatMessage[] = [
      ...input.resume.messages,
      { role: "tool", tool_call_id: input.resume.callId, content: truncate(input.resume.output, 8000) },
    ];
    emit({ type: "sandbox_result", callId: input.resume.callId, output: truncate(input.resume.output, 400) });
    return loop({
      messages,
      input,
      emit,
      toolLog,
      step: 0,
      maxSteps: agentMaxSteps(),
      seedText: input.resume.priorText || "",
      // Rebuild the tool context. Without this a resumed turn loses every
      // attachment, so a Builder run that touches vision_read after a
      // sandbox_exec round trip silently degrades to "no attachments".
      ctx: contextFrom(input.turns, input.mode),
    });
  }

  /* ---------------------------- fresh turn ---------------------------- */
  const attachments = input.turns.flatMap((t) => t.attachments || []);
  const memory = recallFacts(userText, 6);
  const memoryBlock = memory.length
    ? `\n\nLONG-TERM MEMORY (facts you stored earlier - use them, and correct them if the user contradicts you):\n${memory
        .map((f) => `- [${f.tag}] ${f.text}`)
        .join("\n")}`
    : "";

  /**
   * Attachments are NOT inlined into the conversation message. Base64 parts
   * would (a) bloat every request, and (b) 400 on pinned models without a
   * vision modality. Instead the model is told the files are attached and
   * reads them through the vision_read tool, which runs on the GEMINI key -
   * so vision works identically with every model in the dropdown, and Gemini
   * is the engine that actually looks at the file in every mode.
   */
  const attachmentBlock = attachments.length
    ? `\n\nATTACHED THIS TURN: ${attachments.map((a) => `${a.name} (${a.mime}, ${a.bytes} bytes)`).join(", ")}.` +
      `\nThe attached file(s) are available to you through the vision_read tool (powered by the Gemini vision engine).` +
      `\nCall vision_read BEFORE answering anything about their contents. Never describe an attachment you have not read.`
    : "";

  const system: ChatMessage = {
    role: "system",
    content:
      `${AGENT_SYSTEM_PROMPT}\n\n${MODE_HINT[input.mode] || MODE_HINT.chat}${memoryBlock}${attachmentBlock}`,
  };

  const history: ChatMessage[] = [];
  const prior = input.turns.slice(0, -1).slice(-16);
  for (const turn of prior) {
    history.push({ role: turn.role, content: redactText(turn.content).text.slice(0, 8000) });
  }

  const redactedUser = redactText(userText).text;
  /**
   * Text-only user turn. Small text attachments (< ~24 KB) ride along inline
   * because they cost nothing and help every model; images and PDFs go through
   * vision_read/Gemini exclusively.
   */
  const inlineTextBlocks = attachments
    .filter((a) => a.text && a.text.length <= 24_000)
    .map((a) => `--- ${a.name} ---\n${a.text!.slice(0, 24_000)}`);
  const userContent =
    [redactedUser || "(see attachments)", ...inlineTextBlocks].join("\n\n") || "(see attachments)";

  const messages: ChatMessage[] = [system, ...history, { role: "user", content: userContent }];

  /** Vision must always be available whenever a file was attached. */
  const allowedTools = hasAttachments
    ? Array.from(new Set([...input.allowedTools, "vision_read"]))
    : input.allowedTools;

  const ctx: ToolContext = contextFrom(input.turns, input.mode);

  return loop({ messages, input: { ...input, allowedTools }, emit, toolLog, step: 0, maxSteps: agentMaxSteps(), ctx });
}

/**
 * Build the tool context from the turn list. Shared by the fresh turn and the
 * sandbox resume path so the two can never drift apart.
 *
 * Images and PDFs always go in; text/doc attachments ride along too when they
 * were too large for the inline prompt block, so vision_read (Gemini) can read
 * a 5 MB CSV just as well as a photo.
 */
function contextFrom(turns: AgentTurn[], mode: AgentMode): ToolContext {
  const attachments = turns.flatMap((t) => t.attachments || []);
  return {
    images: attachments.filter((a) => a.kind === "image").map((a) => a.dataUrl),
    docs: attachments
      .filter(
        (a) =>
          (a.kind === "pdf" || a.kind === "doc" || a.kind === "text") &&
          a.dataUrl &&
          // Small text was already inlined into the prompt - no need to send
          // it to the vision engine as well.
          (a.kind !== "text" || !a.text || a.text.length > 24_000),
      )
      .map((a) => ({ filename: a.name, file_data: a.dataUrl })),
    attachmentNotes: attachments.map((a) => a.name),
    mode,
  };
}

interface LoopArgs {
  messages: ChatMessage[];
  input: AgentRunInput;
  emit: (e: AgentEvent) => void;
  toolLog: { name: string; ok: boolean; summary: string }[];
  step: number;
  maxSteps: number;
  ctx?: ToolContext;
  /** Assistant text already streamed to the browser before a sandbox pause. */
  seedText?: string;
}

async function loop(args: LoopArgs): Promise<AgentRunResult> {
  const { input, emit, toolLog } = args;
  let messages = args.messages;
  let finalText = args.seedText || "";
  let pinnedModel = input.model || "";
  let model = "";
  let reasoning = "";

  for (let step = args.step; step < args.maxSteps; step += 1) {
    let streamed = "";
    emit({ type: "status", text: step === 0 ? "Thinking…" : `Reasoning step ${step + 1}…` });

    const streamOpts = {
      messages,
      temperature: input.temperature ?? 0.4,
      maxTokens: input.mode === "builder" ? 3600 : 2600,
      tools: toolSpecs(input.allowedTools),
      reasoning: input.reasoning,
      onDelta: (text: string, think: string) => {
        if (text) emit({ type: "delta", text });
        if (think) emit({ type: "reasoning", text: think });
      },
    };

    /**
     * A pinned model is used on its own - the request carries exactly that
     * slug, no fallback array, no substitution. Only if it genuinely cannot
     * serve the turn (out of credit, key stops authorising it, or the model is
     * unreachable after retries) does the turn fall back to the Auto chain,
     * and the browser is told to move the dropdown back to "Auto (fallback
     * chain)" so the UI matches reality. The Auto chain itself is untouched.
     */
    let result;
    if (pinnedModel) {
      emit({ type: "status", text: `Answering with ${pinnedModel} (pinned - no substitution).` });
      try {
        result = await completeStream({ ...streamOpts, models: [pinnedModel], pinned: true });
      } catch (err) {
        const e = err as { status?: number; message?: string };
        const status = e.status || 0;
        const message = e.message || String(err);
        const outOfCredit = isCreditError(status, message) || isFatalAuth(status, message) || isGeminiQuotaError(status, message);
        const reason = isFatalAuth(status, message)
          ? "the key stopped authorising it"
          : outOfCredit
            ? "its credits ran out"
            : "could not be reached";
        emit({
          type: "status",
          text: `${pinnedModel} ${reason} - switching to the Auto fallback chain. (${message.slice(0, 140)})`,
        });
        emit({ type: "model_reset", from: pinnedModel, reason: `${reason}: ${message.slice(0, 120)}` });
        pinnedModel = "";
        result = await completeStream({ ...streamOpts, models: undefined });
      }
    } else {
      result = await completeStream({ ...streamOpts, models: undefined });
    }

    streamed = result.text;
    model = result.model;
    reasoning += result.reasoning || "";
    // Accumulate, do not overwrite. A turn that speaks, calls a tool and speaks
    // again streams both halves to the browser; assigning here used to persist
    // only the last one, so reloading the conversation lost the earlier text.
    if (streamed.trim()) finalText = finalText ? `${finalText}\n\n${streamed}` : streamed;

    if (!result.toolCalls.length) break;

    const ctx: ToolContext = args.ctx || { images: [], docs: [], attachmentNotes: [], mode: input.mode };
    const wireCalls: ToolCallWire[] = [];
    const toolMessages: ChatMessage[] = [];
    let clientCall: PendingClientCall | null = null;

    for (const call of result.toolCalls) {
      const argsParsed = parseArgs(call.arguments);
      wireCalls.push({
        id: call.id || `call_${step}_${wireCalls.length}`,
        type: "function",
        function: { name: call.name, arguments: call.arguments || "{}" },
      });
      emit({ type: "tool_start", name: call.name, args: argsParsed });

      if (isClientTool(call.name)) {
        clientCall = {
          callId: wireCalls[wireCalls.length - 1].id,
          name: call.name,
          payload: argsParsed,
          messages: [],
        };
        continue;
      }

      const outcome = await runTool(call.name, argsParsed, ctx);
      toolLog.push({ name: call.name, ok: outcome.ok, summary: outcome.output.slice(0, 160) });
      for (const event of outcome.events) emit(event);
      emit({
        type: outcome.ok ? "tool_result" : "tool_error",
        name: call.name,
        output: outcome.output.slice(0, 4000),
      });
      toolMessages.push({
        role: "tool",
        tool_call_id: wireCalls[wireCalls.length - 1].id,
        name: call.name,
        content: truncate(outcome.output, 12000),
      });
    }

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: streamed || "",
      tool_calls: wireCalls,
    };

    if (clientCall) {
      // Pause: the browser must execute this call, then POST the result back.
      const paused: ChatMessage[] = [...messages, assistantMessage, ...toolMessages];
      // The paused state travels to the browser and back: strip base64 payloads.
      clientCall.messages = slimMessages(paused);
      emit({ type: clientCall.name === "ask_user" ? "ask" : "sandbox_request", ...clientCall.payload, callId: clientCall.callId, name: clientCall.name });
      return {
        text: finalText,
        reasoning: reasoning || undefined,
        model,
        conversationId: input.conversationId || "",
        toolLog,
        pending: clientCall,
        factsAdded: 0,
      };
    }

    messages = [...messages, assistantMessage, ...toolMessages];
    if (step === args.maxSteps - 1) {
      emit({ type: "status", text: `Tool budget reached after ${args.maxSteps} steps.` });
    }
  }

  const conversation = upsertConversation({
    id: input.conversationId || undefined,
    mode: input.mode,
    model,
    messages: [
      ...input.turns.map((t) => ({ role: t.role, content: t.content, at: new Date().toISOString() })),
      { role: "assistant" as const, content: finalText, model, at: new Date().toISOString() },
    ],
  });

  recordAudit({
    actor: "agent",
    action: input.mode,
    model,
    redactions: 0,
    detail: `${toolLog.length} tools · ${input.turns[input.turns.length - 1]?.content.slice(0, 60) || ""}`,
  });

  // Evolve: distil durable facts in the background, never blocking the reply.
  void distillMemory(conversation.messages).then((facts) => {
    if (facts.length) emit({ type: "memory", fact: facts[0], count: facts.length });
  });

  emit({ type: "done", model, conversationId: conversation.id, text: finalText });

  return {
    text: finalText,
    reasoning: reasoning || undefined,
    model,
    conversationId: conversation.id,
    toolLog,
    factsAdded: 0,
  };
}

/** Drop base64 image/file parts from a paused transcript - only text needs to survive the round trip. */
function slimMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    if (!Array.isArray(m.content)) return m;
    const text = (m.content as ContentPart[])
      .map((part) => {
        if (part.type === "text") return part.text;
        if (part.type === "image_url") return "[image attached]";
        return `[file: ${part.file.filename}]`;
      })
      .join("\n");
    return { ...m, content: text };
  });
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Some providers stream malformed JSON (trailing commas, single quotes).
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, "$1").replace(/'/g, '"')) as Record<string, unknown>;
    } catch {
      return { _raw: raw };
    }
  }
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max)}\n…[truncated]` : s;
}

function offlineNotice() {
  const keyHint = openRouterKey() ? "" : " Set OPENROUTER_API_KEY on Render to switch on the live model layer.";
  return `**ONE HEALTH AI is in offline mode.**${keyHint}

Everything local still works: the Ghana ensemble forecasts, z-score/CUSUM early warning, DHIMS2 parsing, the workbook, and this interface. The live agent brain - reasoning, tool calling, web research, vision, image generation, sandbox - runs through the OpenRouter key with automatic multi-model fallback.

Try the **Forecast**, **Surveillance** or **Extracts** tabs, or add the key and reload.`;
}
