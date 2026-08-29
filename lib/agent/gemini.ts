import { geminiKey } from "@/lib/env";
import {
  CHAT_MODELS,
  complete,
  geminiConfigured,
  isCreditError,
  isFatalAuth,
  supportsThinking,
  toGeminiContents,
  type ChatMessage,
  type ContentPart,
  type LLMResult,
} from "@/lib/llm";

/**
 * Agent-facing Gemini helpers.
 *
 * The wire protocol, model chain, catalogue filter and error taxonomy all live
 * in `lib/llm.ts` - the single Gemini engine used by every surface of the
 * platform. This module is the thin, task-shaped layer on top of it: vision
 * reads, a liveness ping, and the names the agent code has always used.
 */

/** Text + vision models, newest cheap-first. Override with GEMINI_MODELS. */
export const GEMINI_MODEL_CHAIN = CHAT_MODELS;

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

export { geminiConfigured, supportsThinking, toGeminiContents };

/**
 * Quota and billing exhaustion. Kept separate from auth failure because the two
 * mean different things to the caller: one should retry on another model, the
 * other should stop and tell the user their key is wrong.
 */
export function isGeminiQuotaError(status: number, message: string): boolean {
  return isCreditError(status, message) && !isGeminiAuthError(status, message);
}

export function isGeminiAuthError(status: number, message: string): boolean {
  return isFatalAuth(status, message);
}

/** True when the message chain carries at least one image or document. */
export function hasAttachments(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      (m.content as ContentPart[]).some((p) => p.type === "image_url" || p.type === "file"),
  );
}

export interface GeminiCompleteOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask for strict JSON via responseMimeType. */
  json?: boolean;
  models?: string[];
}

/**
 * Walk the Gemini model chain. An auth failure stops immediately - retrying a
 * bad key against six models just burns latency. A quota failure moves on.
 */
export async function geminiComplete(opts: GeminiCompleteOptions): Promise<GeminiResult> {
  if (!geminiKey()) throw new GeminiError("GEMINI_API_KEY is not set", 0);
  try {
    const result: LLMResult = await complete({
      messages: opts.messages,
      models: opts.models,
      temperature: opts.temperature,
      maxTokens: Math.max(opts.maxTokens ?? 4096, 2048),
      json: opts.json,
    });
    return { text: result.text, model: result.model, degraded: result.degraded };
  } catch (err) {
    const e = err as { message?: string; status?: number; model?: string };
    throw new GeminiError(e.message || String(err), e.status || 0, e.model || "");
  }
}

/**
 * Canonical Gemini VISION entry point. Images and documents travel as
 * inlineData parts; thinking is disabled so a photo read can never starve on
 * its output budget. Used by the agent's vision_read tool, the Vision Lab and
 * any attachment flow - Gemini is the vision engine platform-wide.
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
  if (!geminiKey()) return { ok: false, model: "", detail: "GEMINI_API_KEY is not set" };
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
