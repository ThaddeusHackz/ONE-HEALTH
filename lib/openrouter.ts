import { extraOpenRouterModels, openRouterKey, openRouterReferer, openRouterTitle } from "./env";
import { GHANA_CONTEXT } from "./ghana";

/**
 * OpenRouter (2026) accepts at most THREE slugs in the request `models` array.
 * A longer list returns HTTP 400: "'models' array must have 3 items or fewer."
 * We therefore walk the full chain in groups of three.
 */
export const MAX_MODELS_PER_REQUEST = 3;

/** Fast, widely available paid slugs first. Invalid slugs are skipped per group. */
export const CHAT_MODELS = [
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "openai/gpt-4.1",
  "google/gemini-2.5-pro",
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.3-70b-instruct",
  "mistralai/mistral-large-2411",
];

export const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

export const VISION_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-pro",
  "openai/gpt-4.1",
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet",
  "qwen/qwen2.5-vl-72b-instruct:free",
  "google/gemma-3-27b-it:free",
];

export const FAST_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4.1-mini",
  "openai/gpt-4o-mini",
  "deepseek/deepseek-chat",
  ...FREE_MODELS,
];

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatContent = string | ContentPart[];

export interface ToolCallWire {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: ChatContent;
  /** Assistant message that requested tool execution. */
  tool_calls?: ToolCallWire[];
  /** Tool-role message answering one specific call. */
  tool_call_id?: string;
  name?: string;
}

export interface ORResult {
  text: string;
  model: string;
  id?: string;
  tried?: string[];
  /** Set when the answer was produced without something the caller supplied. */
  degraded?: string;
}

let lastError = "";

export function lastOpenRouterError() {
  return lastError;
}

export function openRouterConfigured() {
  return Boolean(openRouterKey());
}

function unique(models: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function modelChain(preferred?: string[]) {
  return unique([
    ...extraOpenRouterModels(),
    ...(preferred || []),
    ...CHAT_MODELS,
    ...FREE_MODELS,
    "openrouter/auto",
  ]);
}

class RouterError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const o = part as { text?: string; content?: string };
          return String(o.text || o.content || "");
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function isFatalAuth(status: number, message: string) {
  if (status === 401) return true;
  return (
    status === 403 &&
    /invalid.?api.?key|unauthorized|user not found|no auth|missing authentication|cookie/i.test(message)
  );
}

export function isCreditError(status: number, message: string) {
  return status === 402 || /402|credit|balance|payment required/i.test(message);
}

function isModelsLimitError(message: string) {
  return /models['"]?\s+array must have 3 items or fewer|at most 3/i.test(message);
}

async function postChat(body: Record<string, unknown>, timeoutMs = 75000): Promise<ORResult> {
  const key = openRouterKey();
  if (!key) throw new RouterError("OPENROUTER_API_KEY is not set", 0);

  if (Array.isArray(body.models) && body.models.length > MAX_MODELS_PER_REQUEST) {
    body = { ...body, models: (body.models as string[]).slice(0, MAX_MODELS_PER_REQUEST) };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": openRouterReferer(),
        "X-Title": openRouterTitle(),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let json: {
      error?: { message?: string; code?: number | string };
      id?: string;
      model?: string;
      choices?: { message?: { content?: unknown; reasoning?: unknown } }[];
    } = {};
    try {
      json = JSON.parse(raw);
    } catch {
      throw new RouterError(`OpenRouter returned non-JSON (${res.status}): ${raw.slice(0, 160)}`, res.status);
    }
    if (!res.ok) {
      throw new RouterError(json.error?.message || `OpenRouter ${res.status}`, res.status);
    }
    const msg = json.choices?.[0]?.message;
    const text = extractText(msg?.content) || extractText(msg?.reasoning);
    if (!text) throw new RouterError("Empty model response", res.status);
    return { text, model: json.model || String(body.model || "openrouter"), id: json.id };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new RouterError("OpenRouter request timed out", 408);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function tryGroup(group: string[], base: Record<string, unknown>): Promise<ORResult> {
  const models = group.slice(0, MAX_MODELS_PER_REQUEST);
  try {
    return await postChat({
      ...base,
      model: models[0],
      models,
      provider: { allow_fallbacks: true, sort: "throughput" },
    });
  } catch (err) {
    const e = err as RouterError;
    if (isModelsLimitError(e.message) && models.length > 1) {
      return postChat({
        ...base,
        model: models[0],
        models: models.slice(0, 1),
        provider: { allow_fallbacks: true },
      });
    }
    throw e;
  }
}

async function tryChain(models: string[], base: Record<string, unknown>): Promise<ORResult> {
  const tried: string[] = [];
  const errors: string[] = [];

  for (const group of chunk(models, MAX_MODELS_PER_REQUEST)) {
    tried.push(...group);
    try {
      const r = await tryGroup(group, base);
      r.tried = tried;
      return r;
    } catch (err) {
      const e = err as RouterError;
      errors.push(`${group.join(" → ")}: ${e.message}`);
      if (isFatalAuth(e.status, e.message)) {
        lastError = errors.join(" | ");
        throw new RouterError(
          `OpenRouter rejected the API key (${e.message}). Check OPENROUTER_API_KEY on Render.`,
          e.status,
        );
      }
      if (isCreditError(e.status, e.message)) {
        lastError = errors.join(" | ");
        throw new RouterError(e.message, 402);
      }
    }
  }

  lastError = errors.join(" | ");
  throw new RouterError(lastError || "All OpenRouter models failed");
}

export async function complete(opts: {
  messages: ChatMessage[];
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<ORResult> {
  const models = modelChain(opts.models);
  const body: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.35,
    max_tokens: opts.maxTokens ?? 2200,
    messages: opts.messages,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  };
  lastError = "";
  try {
    return await tryChain(models, body);
  } catch (err) {
    const e = err as RouterError;
    if (isCreditError(e.status, e.message) || /402|credit|balance|quota|payment/i.test(e.message)) {
      return tryChain(unique([...FREE_MODELS, "openrouter/auto"]), body);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Streaming + tool calling (used by the AI Agent tab)
 * ------------------------------------------------------------------ */

export interface ToolCallSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolCallDelta {
  id: string;
  name: string;
  arguments: string;
}

export interface ORStreamResult {
  text: string;
  model: string;
  toolCalls: ToolCallDelta[];
  finishReason: string;
  reasoning?: string;
}

function parseSseLine(line: string) {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return payload === "[DONE]" ? { done: true } : null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function postStream(
  body: Record<string, unknown>,
  onDelta: (text: string, reasoning: string) => void,
  timeoutMs = 170000,
): Promise<ORStreamResult> {
  const key = openRouterKey();
  if (!key) throw new RouterError("OPENROUTER_API_KEY is not set", 0);
  if (Array.isArray(body.models) && body.models.length > MAX_MODELS_PER_REQUEST) {
    body = { ...body, models: (body.models as string[]).slice(0, MAX_MODELS_PER_REQUEST) };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": openRouterReferer(),
        "X-Title": openRouterTitle(),
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: ctrl.signal,
    });

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => "");
      let message = `OpenRouter ${res.status}`;
      try {
        message = (JSON.parse(raw) as { error?: { message?: string } }).error?.message || message;
      } catch {
        if (raw) message = `${message}: ${raw.slice(0, 200)}`;
      }
      throw new RouterError(message, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let reasoning = "";
    let model = String(body.model || "openrouter");
    let finishReason = "";
    const calls = new Map<number, ToolCallDelta>();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const evt = parseSseLine(line);
        if (!evt || (evt as { done?: boolean }).done) continue;
        const chunk = evt as {
          model?: string;
          choices?: {
            delta?: {
              content?: string;
              reasoning?: string;
              tool_calls?: {
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }[];
            };
            finish_reason?: string | null;
          }[];
        };
        if (chunk.model) model = chunk.model;
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta?.content) {
          text += delta.content;
          onDelta(delta.content, "");
        }
        if (delta?.reasoning) {
          reasoning += delta.reasoning;
          onDelta("", delta.reasoning);
        }
        for (const tc of delta?.tool_calls || []) {
          const idx = tc.index ?? calls.size;
          const prev = calls.get(idx) || { id: "", name: "", arguments: "" };
          calls.set(idx, {
            id: tc.id || prev.id,
            name: tc.function?.name ? prev.name + tc.function.name : prev.name,
            arguments: prev.arguments + (tc.function?.arguments || ""),
          });
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    }

    const toolCalls = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => c)
      .filter((c) => c.name);

    if (!text && !toolCalls.length) throw new RouterError("Empty streamed model response", 200);
    return { text, model, toolCalls, finishReason, reasoning: reasoning || undefined };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new RouterError("OpenRouter stream timed out", 408);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Streaming completion with optional tool calling. Falls back down the same
 * 3-slug-at-a-time model chain as `complete`, and drops `tools` for providers
 * that reject them so a tool-capable request can never hard-fail.
 */
export async function completeStream(opts: {
  messages: ChatMessage[];
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolCallSpec[];
  reasoning?: boolean;
  onDelta: (text: string, reasoning: string) => void;
}): Promise<ORStreamResult> {
  const models = modelChain(opts.models);
  const withTools = (opts.tools || []).length > 0;
  const base: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 2600,
    messages: opts.messages,
    ...(withTools ? { tools: opts.tools, tool_choice: "auto" } : {}),
    ...(opts.reasoning ? { reasoning: { effort: "medium" } } : {}),
  };

  const attempts: Record<string, unknown>[] = [base];
  if (withTools) attempts.push({ ...base, tools: undefined, tool_choice: undefined });
  attempts.push({ ...base, tools: undefined, tool_choice: undefined, models: [...FREE_MODELS, "openrouter/auto"] });

  lastError = "";
  const errors: string[] = [];

  for (const attempt of attempts) {
    const chain = Array.isArray(attempt.models) ? (attempt.models as string[]) : models;
    for (const group of chunk(chain, MAX_MODELS_PER_REQUEST)) {
      try {
        const result = await postStream(
          { ...attempt, models: group, model: group[0], provider: { allow_fallbacks: true, sort: "throughput" } },
          opts.onDelta,
        );
        return result;
      } catch (err) {
        const e = err as RouterError;
        errors.push(`${group.join(" → ")}: ${e.message}`);
        if (isFatalAuth(e.status, e.message)) {
          lastError = errors.join(" | ");
          throw new RouterError(
            `OpenRouter rejected the API key (${e.message}). Check OPENROUTER_API_KEY on Render.`,
            e.status,
          );
        }
        if (isCreditError(e.status, e.message)) {
          lastError = errors.join(" | ");
          throw new RouterError(e.message, 402);
        }
      }
    }
  }

  lastError = errors.join(" | ");
  throw new RouterError(lastError || "All OpenRouter models failed");
}

export async function completeWithSystem(opts: {
  user: ChatContent;
  extraSystem?: string;
  history?: ChatMessage[];
  models?: string[];
  temperature?: number;
}): Promise<ORResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${GHANA_CONTEXT}\n${opts.extraSystem || ""}`.trim() },
    ...(opts.history || []),
    { role: "user", content: opts.user },
  ];
  return complete({ messages, models: opts.models, temperature: opts.temperature });
}

export async function visionAnalyze(opts: {
  prompt: string;
  images: string[];
  files?: { filename: string; file_data: string }[];
  extraSystem?: string;
}): Promise<ORResult> {
  const parts: ContentPart[] = [
    { type: "text", text: opts.prompt },
    ...opts.images.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
    ...(opts.files || []).map((file) => ({ type: "file" as const, file })),
  ];
  const attachmentCount = opts.images.length + (opts.files?.length || 0);
  try {
    return await completeWithSystem({
      user: parts,
      extraSystem: opts.extraSystem,
      models: VISION_MODELS,
      temperature: 0.2,
    });
  } catch (err) {
    // This used to silently retry text-only, so a failed vision chain returned a
    // confident "analysis" of an attachment the model never saw - a hallucination
    // presented as a reading. The fallback stays (a text answer can still be
    // useful) but it now says loudly that it could not see the file, and the
    // caller is told the result is degraded.
    const reason = (err as Error)?.message || "vision chain failed";
    const result = await completeWithSystem({
      user:
        `${opts.prompt}\n\n` +
        `IMPORTANT: ${attachmentCount} attachment(s) were supplied but the vision models are unavailable ` +
        `(${reason.slice(0, 200)}). You have NOT seen the image or document. ` +
        `Do not describe, transcribe or infer anything about its contents. ` +
        `Say plainly that the attachment could not be read, and explain what would be needed to read it.`,
      extraSystem: opts.extraSystem,
      models: FAST_MODELS,
      temperature: 0.2,
    });
    return {
      ...result,
      degraded: `Vision models unavailable - ${attachmentCount} attachment(s) were not read.`,
    };
  }
}

export function fallbackGroups(models = modelChain()) {
  return chunk(models, MAX_MODELS_PER_REQUEST);
}
