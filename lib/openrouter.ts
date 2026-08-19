import { openRouterKey, openRouterReferer, openRouterTitle } from "./env";
import { GHANA_CONTEXT } from "./ghana";

export const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

export const CHAT_MODELS = [
  "openai/gpt-4.1",
  "google/gemini-2.5-pro",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "anthropic/claude-3.7-sonnet",
  "deepseek/deepseek-chat-v3-0324",
  "meta-llama/llama-4-maverick",
  "mistralai/mistral-large-2411",
  ...FREE_MODELS,
];

export const VISION_MODELS = [
  "google/gemini-2.5-pro",
  "openai/gpt-4.1",
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "anthropic/claude-3.7-sonnet",
  "qwen/qwen2.5-vl-72b-instruct:free",
  "google/gemma-3-27b-it:free",
];

export const FAST_MODELS = [
  "google/gemini-2.5-flash",
  "openai/gpt-4.1-mini",
  "deepseek/deepseek-chat-v3-0324",
  "meta-llama/llama-4-maverick",
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
}

export function openRouterConfigured() {
  return Boolean(openRouterKey());
}

async function postChat(body: Record<string, unknown>, timeoutMs = 90000): Promise<ORResult> {
  const key = openRouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

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
      error?: { message?: string };
      id?: string;
      model?: string;
      choices?: { message?: { content?: unknown } }[];
    } = {};
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`OpenRouter returned non-JSON (${res.status})`);
    }
    if (!res.ok) {
      throw new Error(json.error?.message || `OpenRouter ${res.status}`);
    }
    const content = json.choices?.[0]?.message?.content;
    const text = extractText(content);
    if (!text) throw new Error("Empty model response");
    return { text, model: json.model || "openrouter", id: json.id };
  } finally {
    clearTimeout(t);
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text || "");
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export async function complete(opts: {
  messages: ChatMessage[];
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<ORResult> {
  const models = opts.models?.length ? opts.models : CHAT_MODELS;
  const body = {
    model: models[0],
    models,
    provider: { allow_fallbacks: true, sort: "throughput" },
    temperature: opts.temperature ?? 0.35,
    max_tokens: opts.maxTokens ?? 2200,
    messages: opts.messages,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  };
  try {
    return await postChat(body);
  } catch (err) {
    const msg = (err as Error).message || "";
    if (/402|credit|balance|quota|payment/i.test(msg)) {
      return postChat({ ...body, model: FREE_MODELS[0], models: FREE_MODELS });
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
  return completeWithSystem({
    user: parts,
    extraSystem: opts.extraSystem,
    models: VISION_MODELS,
    temperature: 0.2,
  });
}
