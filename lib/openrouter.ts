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

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

export interface ORResult {
  text: string;
  model: string;
  id?: string;
  tried?: string[];
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

function isFatalAuth(status: number, message: string) {
  if (status === 401) return true;
  return (
    status === 403 &&
    /invalid.?api.?key|unauthorized|user not found|no auth|missing authentication|cookie/i.test(message)
  );
}

function isCreditError(status: number, message: string) {
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
  try {
    return await completeWithSystem({
      user: parts,
      extraSystem: opts.extraSystem,
      models: VISION_MODELS,
      temperature: 0.2,
    });
  } catch {
    return completeWithSystem({
      user: `${opts.prompt}\n\n(Vision parts omitted after first chain failed — text-only fallback.)`,
      extraSystem: opts.extraSystem,
      models: FAST_MODELS,
      temperature: 0.2,
    });
  }
}

export function fallbackGroups(models = modelChain()) {
  return chunk(models, MAX_MODELS_PER_REQUEST);
}
