import { geminiKey } from "@/lib/env";
import type { ChatContent, ChatMessage, ContentPart } from "@/lib/openrouter";

/**
 * Gemini (Google AI) REST client for text, vision and research synthesis.
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header  x-goog-api-key: <key>
 *   body    { contents:[{role,parts:[{text}|{inlineData}]}],
 *             systemInstruction:{parts:[{text}]},
 *             generationConfig:{ temperature, maxOutputTokens, responseMimeType } }
 *
 * It speaks the same `ChatMessage` shape as the OpenRouter layer so the agent
 * loop and the research engine can be pointed at either provider without
 * rewriting their prompts.
 *
 * A key distinction from the image path in `media.ts`: that one asks for
 * `responseModalities: ["TEXT","IMAGE"]`. This client never does - it is text
 * out, so no image-generation quota is consumed by a vision read.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Text + vision models, newest cheap-first. Override with GEMINI_MODELS. */
export const GEMINI_MODEL_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-1.5-pro",
];

export interface GeminiResult {
  text: string;
  model: string;
  /** Set when the answer came without something the caller supplied. */
  degraded?: string;
}

export class GeminiError extends Error {
  status: number;
  model: string;
  constructor(message: string, status: number, model = "") {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.model = model;
  }
}

export function geminiConfigured(): boolean {
  return Boolean(geminiKey());
}

function modelChain(): string[] {
  const raw = process.env.GEMINI_MODELS || process.env.GEMINI_TEXT_MODELS || "";
  const custom = raw
    .split(/[, \n]/)
    .map((s) => s.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return custom.length ? custom : GEMINI_MODEL_CHAIN;
}

/**
 * Quota and billing exhaustion. Kept separate from auth failure because the two
 * mean different things to the caller: one should retry on another model, the
 * other should stop and tell the user their key is wrong.
 */
export function isGeminiQuotaError(status: number, message: string): boolean {
  return (
    status === 429 ||
    /429|quota|rate.?limit|resource exhausted|exceeded your current quota|billing|payment/i.test(message)
  );
}

export function isGeminiAuthError(status: number, message: string): boolean {
  return (
    status === 401 ||
    status === 403 ||
    /api.?key not valid|invalid.?api.?key|permission denied|unauthorized/i.test(message)
  );
}

/* --------------------------- message conversion --------------------------- */

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

function dataUrlToInline(part: { url: string }): GeminiPart | null {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(part.url || "");
  if (!match) return null;
  return { inlineData: { mimeType: match[1] || "application/octet-stream", data: match[2] } };
}

function partsFrom(content: ChatContent): GeminiPart[] {
  if (typeof content === "string") return content ? [{ text: content }] : [];
  const out: GeminiPart[] = [];
  for (const part of content as ContentPart[]) {
    if (part.type === "text" && part.text) out.push({ text: part.text });
    else if (part.type === "image_url") {
      const inline = dataUrlToInline(part.image_url);
      if (inline) out.push(inline);
    } else if (part.type === "file") {
      // PDFs and other documents travel as base64 data URLs, same as images.
      const inline = dataUrlToInline({ url: part.file.file_data });
      if (inline) out.push(inline);
    }
  }
  return out;
}

function toGeminiContents(messages: ChatMessage[]): {
  system: string;
  contents: { role: "user" | "model"; parts: GeminiPart[] }[];
} {
  const systemParts: string[] = [];
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      const parts = partsFrom(m.content);
      for (const p of parts) if (p.text) systemParts.push(p.text);
      continue;
    }
    // Gemini has no tool role; a tool answer is folded into the user turn so the
    // model still sees the result of the call it asked for.
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    const parts = partsFrom(m.content);
    if (!parts.length) continue;
    const last = contents[contents.length - 1];
    // Gemini rejects consecutive same-role turns; merge them.
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }

  // A conversation must not open with a model turn.
  while (contents.length && contents[0].role === "model") contents.shift();
  if (!contents.length) contents.push({ role: "user", parts: [{ text: "(no content)" }] });

  return { system: systemParts.join("\n\n").trim(), contents };
}

/* -------------------------------- request -------------------------------- */

export interface GeminiCompleteOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask for strict JSON via responseMimeType. */
  json?: boolean;
  models?: string[];
}

/** True when the message chain carries at least one image or document. */
export function hasAttachments(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      (m.content as ContentPart[]).some((p) => p.type === "image_url" || p.type === "file"),
  );
}

/**
 * gemini-2.5+ are *thinking* models: hidden reasoning runs FIRST and consumes
 * the output-token budget. With a small maxOutputTokens the API happily returns
 * a candidate with finishReason MAX_TOKENS and NO text - which used to look
 * exactly like "the Gemini key does not work" even though the key was fine on
 * other platforms. Disabling the thinking budget (or giving it headroom) fixes
 * it. gemini-2.0 and older reject thinkingConfig, so it is added selectively.
 */
function supportsThinking(model: string): boolean {
  return /(^|[-/.])(2\.5|2\.6|3\.\d+|flash-latest|pro-latest)/i.test(model);
}

function buildBody(opts: GeminiCompleteOptions, system: string, contents: unknown, maxTokens: number, disableThinking: boolean): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: maxTokens,
    ...(opts.json ? { responseMimeType: "application/json" } : {}),
  };
  if (disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const body: Record<string, unknown> = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}

async function callOnce(
  model: string,
  body: Record<string, unknown>,
  key: string,
  timeoutMs: number,
): Promise<GeminiResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try {
      json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      /* non-JSON error page */
    }

    if (!res.ok) {
      const err = (json.error as { message?: string })?.message || raw.slice(0, 300) || `HTTP ${res.status}`;
      throw new GeminiError(err, res.status, model);
    }

    const candidates = (json.candidates as { content?: { parts?: GeminiPart[] } }[]) || [];
    const parts = candidates[0]?.content?.parts || [];
    const text = parts
      // Gemini 2.5+ return hidden reasoning as parts flagged `thought: true`.
      // Those are NOT the answer - including them both leaks chain-of-thought
      // and makes a thinking-only response look like real output.
      .filter((p) => !(p as { thought?: boolean }).thought)
      .map((p) => p.text || "")
      .join("")
      .trim();

    // A blocked or empty candidate is a failure, not a silent empty answer.
    if (!text) {
      const reason =
        (candidates[0] as { finishReason?: string } | undefined)?.finishReason ||
        ((json.promptFeedback as { blockReason?: string })?.blockReason ?? "no text returned");
      throw new GeminiError(`Gemini returned no text (${reason})`, 200, model);
    }

    return { text, model };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Walk the Gemini model chain. An auth failure stops immediately - retrying a
 * bad key against eight models just burns latency. A quota failure moves on.
 *
 * Each model is tried with thinking disabled first (fast, deterministic, no
 * MAX_TOKENS starvation); if that is rejected the same model is retried once
 * with plain generation config before moving on.
 */
export async function geminiComplete(opts: GeminiCompleteOptions): Promise<GeminiResult> {
  const key = geminiKey();
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set", 0);

  const { system, contents } = toGeminiContents(opts.messages);
  const maxTokens = Math.max(opts.maxTokens ?? 4096, 2048);

  const chain = opts.models?.length ? opts.models : modelChain();
  const tried: string[] = [];
  let lastError = "";
  let sawQuota = false;

  for (const model of chain) {
    tried.push(model);
    const canDisable = supportsThinking(model);
    const attempts: Record<string, unknown>[] = [
      buildBody(opts, system, contents, maxTokens, canDisable),
      buildBody(opts, system, contents, Math.min(maxTokens * 2, 16384), false),
    ];
    for (const body of attempts) {
      try {
        const result = await callOnce(model, body, key, 90000);
        return sawQuota
          ? { ...result, degraded: `Earlier Gemini models were out of quota; answered by ${model}.` }
          : result;
      } catch (err) {
        const e = err as GeminiError;
        lastError = e.message || String(err);
        if (isGeminiAuthError(e.status, lastError)) {
          throw new GeminiError(
            `Gemini rejected the API key (${lastError.slice(0, 160)}). Check GEMINI_API_KEY.`,
            e.status,
            model,
          );
        }
        if (isGeminiQuotaError(e.status, lastError)) {
          sawQuota = true;
          break; // next model
        }
        // MAX_TOKENS starvation or a rejected thinkingConfig: the second
        // attempt (no thinkingConfig, larger budget) handles both. Anything
        // else (bad slug, transient 500) also falls through to the retry, and
        // then to the next model in the chain.
      }
    }
  }

  throw new GeminiError(
    `Every Gemini model failed. Tried: ${tried.join(", ")}. Last error: ${lastError.slice(0, 220)}`,
    0,
  );
}

/**
 * Canonical Gemini VISION entry point. Images and documents travel as
 * inlineData parts; thinking is disabled so a photo read can never starve on
 * its output budget. Used by the agent's vision_read tool, the Vision Lab and
 * any attachment flow - Gemini is the primary vision engine platform-wide.
 */
export async function geminiVision(opts: {
  prompt: string;
  images: string[];
  files?: { filename: string; file_data: string }[];
  extraSystem?: string;
  maxTokens?: number;
}): Promise<GeminiResult> {
  const parts: ContentPart[] = [
    { type: "text", text: opts.prompt },
    ...opts.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
    ...(opts.files || []).map((file) => ({ type: "file" as const, file })),
  ];
  const messages: ChatMessage[] = [
    ...(opts.extraSystem ? [{ role: "system" as const, content: opts.extraSystem }] : []),
    { role: "user", content: parts },
  ];
  return geminiComplete({
    messages,
    temperature: 0.2,
    maxTokens: opts.maxTokens ?? 4096,
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  });
}

/** Liveness probe for /api/diagnostics - one tiny generateContent call. */
export async function geminiPing(): Promise<{ ok: boolean; model: string; detail: string }> {
  const key = geminiKey();
  if (!key) return { ok: false, model: "", detail: "GEMINI_API_KEY is not set" };
  try {
    const result = await geminiComplete({
      messages: [{ role: "user", content: "Reply with exactly GEMINI_OK" }],
      temperature: 0,
      maxTokens: 2048,
      models: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"],
    });
    const ok = /GEMINI_OK/i.test(result.text);
    return {
      ok,
      model: result.model,
      detail: ok ? `${result.model} answered GEMINI_OK` : `unexpected reply: ${result.text.slice(0, 80)}`,
    };
  } catch (err) {
    return { ok: false, model: "", detail: (err as Error).message.slice(0, 240) };
  }
}
