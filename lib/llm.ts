import { extraGeminiModels, geminiKey } from "./env";
import { GHANA_CONTEXT } from "./ghana";

/**
 * THE ENGINE: Google Gemini (Google AI Studio REST API).
 *
 * One key - GEMINI_API_KEY - powers EVERYTHING on this platform: chat and
 * reasoning, agentic tool calling, streaming, vision (reading photos, PDFs and
 * documents), deep research synthesis, image generation, speech-to-text and
 * text-to-speech. There is no second model gateway and no second bill.
 *
 *   POST {base}/models/{model}:generateContent            (blocking)
 *   POST {base}/models/{model}:streamGenerateContent?alt=sse   (streaming)
 *   GET  {base}/models                                    (catalogue)
 *   header  x-goog-api-key: <GEMINI_API_KEY>
 *
 * This module owns the wire protocol, the model fallback chain, the
 * self-healing catalogue filter and the error taxonomy. Everything else in the
 * codebase talks to it through `complete`, `completeStream` and
 * `completeWithSystem`.
 */

/**
 * Gemini takes exactly ONE model per request (the model is part of the URL),
 * so the chain is walked one slug at a time. The constant is kept so callers
 * and diagnostics can reason about request batching explicitly.
 */
export const MAX_MODELS_PER_REQUEST = 1;

/**
 * Auto-fallback chain, cheapest-and-fastest first. Every slug is a Google AI
 * Studio model served by the Gemini API. `liveModels()` filters this list
 * against the key's own ListModels catalogue at runtime, so a slug Google
 * retires next month is skipped automatically instead of 404-ing a request.
 */
export const CHAT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
];

/**
 * Free-tier friendly slugs. Used as the last resort after a quota/billing
 * failure on the paid-tier-first chain above.
 */
export const FREE_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemma-3-27b-it",
];

export const FAST_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  ...FREE_MODELS,
];

/**
 * Base URL override. Production always talks to Google's
 * generativelanguage.googleapis.com; the forensic self-test points it at a
 * local mock so the full fallback chain, pinning, tool calling and the error
 * taxonomy can be exercised without a real key.
 */
export function apiBase(): string {
  const raw = (
    process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta"
  ).trim();
  return raw.replace(/\/+$/, "");
}

/** Strip the "models/" prefix Google's catalogue uses. */
function bare(slug: string): string {
  return slug.replace(/^models\//, "").trim();
}

/* ------------------------------------------------------------------ *
 * Wire-neutral message shapes (shared by every caller)
 * ------------------------------------------------------------------ */

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

export interface LLMResult {
  text: string;
  model: string;
  id?: string;
  tried?: string[];
  /** Set when the answer was produced without something the caller supplied. */
  degraded?: string;
}

/** Historical alias kept so call sites read naturally. */
export type ORResult = LLMResult;

let lastError = "";

export function lastGeminiError() {
  return lastError;
}

/** Historical alias. */
export const lastModelError = lastGeminiError;

export function geminiConfigured() {
  return Boolean(geminiKey());
}

/** Historical alias used by routes and the agent loop. */
export const modelConfigured = geminiConfigured;

function unique(models: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const slug = bare(m);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)));
  return out;
}

function modelChain(preferred?: string[]) {
  return unique([...extraGeminiModels(), ...(preferred || []), ...CHAT_MODELS, ...FREE_MODELS]);
}

/* ------------------------------------------------------------------ *
 * Live model catalogue (self-healing chain).
 *
 * GET {base}/models lists exactly what THIS key may call. Once per process -
 * and never for longer than 10 minutes - we fetch it and drop any chain slug
 * Google no longer serves (or the key has no access to). When a model is
 * retired the chain simply walks past it instead of sending a request that
 * 404s.
 * ------------------------------------------------------------------ */

interface CatalogueState {
  at: number;
  /** null = the fetch failed; fall back to the static chain. */
  ids: Set<string> | null;
}

let catalogue: CatalogueState = { at: 0, ids: null };
const CATALOGUE_TTL_MS = 10 * 60 * 1000;

interface CatalogueModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

async function fetchCatalogueIds(): Promise<Set<string> | null> {
  const key = geminiKey();
  if (!key) return null;
  const res = await fetch(`${apiBase()}/models?pageSize=1000`, {
    signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { models?: CatalogueModel[]; data?: { id?: string }[] };
  const ids = new Set<string>();
  for (const m of json.models || []) {
    const methods = m.supportedGenerationMethods;
    // Keep anything that can actually answer a prompt.
    if (methods && methods.length && !methods.some((x) => /generateContent/i.test(x))) continue;
    if (m.name) ids.add(bare(m.name));
  }
  // Tolerate an OpenAI-shaped mock/proxy that returns {data:[{id}]}.
  for (const m of json.data || []) if (m.id) ids.add(bare(m.id));
  return ids.size ? ids : null;
}

async function fetchCatalogue(force = false): Promise<Set<string> | null> {
  if (!force && catalogue.ids && Date.now() - catalogue.at < CATALOGUE_TTL_MS) return catalogue.ids;
  try {
    const ids = await fetchCatalogueIds();
    catalogue = { at: Date.now(), ids };
    return catalogue.ids;
  } catch {
    // Network down, Google hiccup: keep the previous knowledge (if any) and
    // otherwise trust the static chain.
    catalogue = { at: Date.now(), ids: catalogue.ids };
    return catalogue.ids;
  }
}

/**
 * Filter a model list down to slugs Gemini currently serves for this key.
 * Never shrinks to empty - if nothing matches (catalogue unreachable or a
 * fully custom chain) the input is returned untouched.
 */
export async function liveModels(models: string[]): Promise<string[]> {
  if (!models.length) return models;
  let ids: Set<string> | null;
  try {
    ids = await fetchCatalogue();
  } catch {
    ids = null;
  }
  if (!ids) return models;
  const filtered = models.filter((m) => ids!.has(bare(m)));
  return filtered.length ? filtered : models;
}

/** Forget the cached catalogue (used by tests). */
export function resetModelCatalogue(): void {
  catalogue = { at: 0, ids: null };
}

/**
 * Catalogue status for /api/diagnostics: distinguishes "checked and live" from
 * "could not be checked". A chain that could not be verified is NOT reported
 * as verified - an operator must never be told 6/6 models are fine when the
 * catalogue was unreachable.
 */
export async function modelCatalogueStatus(models: string[]): Promise<{
  reachable: boolean;
  live: string[];
  dead: string[];
  total: number;
}> {
  // Deliberately does NOT use the cache: a status probe must reflect what the
  // catalogue says RIGHT NOW, not a stale-but-useful snapshot.
  try {
    const ids = await fetchCatalogueIds();
    if (!ids) return { reachable: false, live: [], dead: [], total: 0 };
    const live = models.filter((m) => ids.has(bare(m)));
    const dead = models.filter((m) => !ids.has(bare(m)));
    return { reachable: true, live, dead, total: ids.size };
  } catch {
    return { reachable: false, live: [], dead: [], total: 0 };
  }
}

export class GeminiRouterError extends Error {
  status: number;
  model: string;
  constructor(message: string, status = 0, model = "") {
    super(message);
    this.name = "GeminiRouterError";
    this.status = status;
    this.model = model;
  }
}

/** Historical alias. */
export const RouterError = GeminiRouterError;

export function isFatalAuth(status: number, message: string) {
  if (status === 401) return true;
  return (
    (status === 403 &&
      !/quota|rate.?limit|resource.?exhausted|billing/i.test(message)) ||
    /api.?key not valid|invalid.?api.?key|api key expired|permission denied|unauthorized|missing authentication|caller does not have permission/i.test(
      message,
    )
  );
}

export function isCreditError(status: number, message: string) {
  return (
    status === 429 ||
    status === 402 ||
    /quota|resource.?exhausted|rate.?limit|billing|payment required|exceeded your current quota|free tier/i.test(
      message,
    )
  );
}

/** Quota exhaustion, named for the agent loop. */
export const isQuotaError = isCreditError;

/** A slug Google no longer serves (or this key cannot call). */
function isDeadSlugError(status: number, message: string) {
  return (
    status === 404 ||
    /is not found|not found for api version|unsupported model|no endpoints|does not exist|not supported for generateContent/i.test(
      message,
    )
  );
}

/**
 * A transient failure worth one same-model retry: gateway 5xx, timeouts and
 * "try again" say retry, not "this model cannot serve you".
 */
export function isTransient(status: number, message: string) {
  return (
    status === 408 ||
    status === 499 ||
    status >= 500 ||
    /timed out|timeout|temporarily|overloaded|unavailable|internal error|try again|deadline/i.test(message)
  );
}

/** Slugs proven dead this process - cached so a poison slug is only paid for once. */
const deadKnown = new Set<string>();

/* ------------------------------------------------------------------ *
 * Message conversion: neutral ChatMessage[] -> Gemini `contents`
 * ------------------------------------------------------------------ */

interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function dataUrlToInline(url: string): GeminiPart | null {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(url || "");
  if (!match) return null;
  return { inlineData: { mimeType: match[1] || "application/octet-stream", data: match[2] } };
}

function partsFrom(content: ChatContent): GeminiPart[] {
  if (typeof content === "string") return content ? [{ text: content }] : [];
  const out: GeminiPart[] = [];
  for (const part of (content || []) as ContentPart[]) {
    if (!part) continue;
    if (part.type === "text" && part.text) out.push({ text: part.text });
    else if (part.type === "image_url") {
      const inline = dataUrlToInline(part.image_url?.url || "");
      if (inline) out.push(inline);
    } else if (part.type === "file") {
      // PDFs and other documents travel as base64 data URLs, same as images.
      const inline = dataUrlToInline(part.file?.file_data || "");
      if (inline) out.push(inline);
    }
  }
  return out;
}

function safeJson(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    return { _raw: raw };
  }
}

/**
 * Convert the neutral transcript into Gemini's `contents`, including the
 * function-call round trip:
 *
 *   assistant.tool_calls[]  -> model turn with functionCall parts
 *   tool message            -> user turn with a functionResponse part
 *
 * Tool ids are ours (Gemini has no ids), so a tool answer is matched back to
 * its call by id through the assistant turn that requested it.
 */
export function toGeminiContents(messages: ChatMessage[]): {
  system: string;
  contents: GeminiContent[];
} {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];
  const nameById = new Map<string, string>();

  for (const m of messages) {
    for (const call of m.tool_calls || []) {
      if (call?.id) nameById.set(call.id, call.function?.name || "tool");
    }
  }

  const push = (role: "user" | "model", parts: GeminiPart[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    // Gemini rejects consecutive same-role turns; merge them.
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };

  for (const m of messages) {
    if (!m) continue;
    if (m.role === "system") {
      for (const p of partsFrom(m.content)) if (p.text) systemParts.push(p.text);
      continue;
    }
    if (m.role === "tool") {
      const name = m.name || (m.tool_call_id ? nameById.get(m.tool_call_id) : "") || "tool";
      const text = typeof m.content === "string" ? m.content : partsFrom(m.content).map((p) => p.text || "").join("\n");
      push("user", [{ functionResponse: { name, response: { output: text } } }]);
      continue;
    }
    if (m.role === "assistant") {
      const parts = partsFrom(m.content);
      for (const call of m.tool_calls || []) {
        parts.push({
          functionCall: { name: call.function?.name || "tool", args: safeJson(call.function?.arguments || "{}") },
        });
      }
      push("model", parts);
      continue;
    }
    push("user", partsFrom(m.content));
  }

  // A conversation must not open with a model turn.
  while (contents.length && contents[0].role === "model") contents.shift();
  if (!contents.length) contents.push({ role: "user", parts: [{ text: "(no content)" }] });

  return { system: systemParts.join("\n\n").trim(), contents };
}

/* ------------------------------------------------------------------ *
 * Tool declarations
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

/**
 * Gemini's schema dialect is OpenAPI-ish and REJECTS several JSON-Schema
 * keywords that the tool specs carry ($schema, additionalProperties,
 * exclusiveMinimum, ...). They are stripped recursively so a tool-calling turn
 * can never 400 on a harmless keyword.
 */
const SCHEMA_DROP = new Set([
  "$schema",
  "$id",
  "$ref",
  "additionalProperties",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "const",
  "examples",
  "default",
  "definitions",
  "patternProperties",
  "oneOf",
  "allOf",
  "not",
]);

export function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (SCHEMA_DROP.has(k)) continue;
    if (k === "type" && typeof v === "string") {
      out.type = v.toLowerCase();
      continue;
    }
    out[k] = sanitizeSchema(v);
  }
  // Gemini requires object schemas to declare properties.
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

function toolDeclarations(tools: ToolCallSpec[]) {
  const functionDeclarations = tools
    .filter((t) => t?.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: (t.function.description || "").slice(0, 1024),
      parameters: sanitizeSchema(t.function.parameters || { type: "object", properties: {} }),
    }));
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

/* ------------------------------------------------------------------ *
 * Request bodies
 * ------------------------------------------------------------------ */

/**
 * gemini-2.5+ are *thinking* models: hidden reasoning runs FIRST and consumes
 * the output-token budget. With a small maxOutputTokens the API returns a
 * candidate with finishReason MAX_TOKENS and NO text - which looks exactly
 * like "the key does not work" even though the key is fine. Thinking is
 * therefore disabled unless the caller explicitly asked for reasoning.
 * gemini-2.0 and older reject thinkingConfig, so it is added selectively.
 */
export function supportsThinking(model: string): boolean {
  return /(^|[-/.])(2\.5|2\.6|3\.\d+|flash-latest|pro-latest)/i.test(model);
}

interface BodyOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  tools?: ToolCallSpec[];
  reasoning?: boolean;
}

function buildBody(
  opts: BodyOptions,
  model: string,
  system: string,
  contents: GeminiContent[],
  maxTokens: number,
  thinking: "off" | "on" | "default",
): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.35,
    maxOutputTokens: maxTokens,
    // Structured output and function calling are mutually exclusive on Gemini.
    ...(opts.json && !(opts.tools || []).length ? { responseMimeType: "application/json" } : {}),
  };
  if (supportsThinking(model)) {
    if (thinking === "off") generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (thinking === "on") generationConfig.thinkingConfig = { includeThoughts: true };
  }
  const body: Record<string, unknown> = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const declarations = toolDeclarations(opts.tools || []);
  if (declarations) {
    body.tools = declarations;
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  return body;
}

function errorFrom(status: number, raw: string, model: string): GeminiRouterError {
  let message = `Gemini ${status}`;
  try {
    const json = JSON.parse(raw) as { error?: { message?: string; status?: string } };
    message = json.error?.message || json.error?.status || message;
  } catch {
    if (raw) message = `${message}: ${raw.slice(0, 200)}`;
  }
  return new GeminiRouterError(message, status, model);
}

/* ------------------------------------------------------------------ *
 * Blocking completion
 * ------------------------------------------------------------------ */

interface Candidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

function textOf(parts: GeminiPart[]): string {
  return parts
    // Gemini 2.5+ return hidden reasoning as parts flagged `thought: true`.
    // Those are NOT the answer - including them leaks chain-of-thought and
    // makes a thinking-only response look like real output.
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text || "")
    .join("")
    .trim();
}

async function postChat(
  model: string,
  body: Record<string, unknown>,
  timeoutMs = 75000,
): Promise<LLMResult> {
  const key = geminiKey();
  if (!key) throw new GeminiRouterError("GEMINI_API_KEY is not set", 0, model);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) throw errorFrom(res.status, raw, model);
    let json: { candidates?: Candidate[]; promptFeedback?: { blockReason?: string }; responseId?: string } = {};
    try {
      json = JSON.parse(raw);
    } catch {
      throw new GeminiRouterError(`Gemini returned non-JSON (${res.status}): ${raw.slice(0, 160)}`, res.status, model);
    }
    const parts = json.candidates?.[0]?.content?.parts || [];
    const text = textOf(parts);
    if (!text) {
      const reason = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason || "no text returned";
      throw new GeminiRouterError(`Gemini returned no text (${reason})`, 200, model);
    }
    return { text, model, id: json.responseId };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new GeminiRouterError("Gemini request timed out", 408, model);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Try ONE model, with the thinking-starvation recovery built in: first with
 * thinking off (fast, deterministic), then once more with a bigger budget and
 * the default config. Both attempts share the same taxonomy.
 */
async function tryModel(model: string, opts: BodyOptions, maxTokens: number): Promise<LLMResult> {
  const { system, contents } = toGeminiContents(opts.messages);
  const attempts: Record<string, unknown>[] = [
    buildBody(opts, model, system, contents, maxTokens, opts.reasoning ? "on" : "off"),
    buildBody(opts, model, system, contents, Math.min(maxTokens * 2, 16384), "default"),
  ];
  let last: GeminiRouterError | null = null;
  for (const body of attempts) {
    try {
      return await postChat(model, body);
    } catch (err) {
      const e = err as GeminiRouterError;
      last = e;
      // Auth, quota and retired slugs are decided at the chain level - there
      // is nothing a second local attempt can do about them.
      if (isFatalAuth(e.status, e.message) || isCreditError(e.status, e.message) || isDeadSlugError(e.status, e.message)) {
        throw e;
      }
    }
  }
  throw last || new GeminiRouterError("Gemini request failed", 0, model);
}

async function tryChain(models: string[], opts: BodyOptions, maxTokens: number): Promise<LLMResult> {
  const tried: string[] = [];
  const errors: string[] = [];
  // Slugs already proven dead in this process never get asked again.
  const walk = models.filter((m) => !deadKnown.has(m));
  let sawQuota = false;

  for (const model of walk.length ? walk : models) {
    tried.push(model);
    try {
      const r = await tryModel(model, opts, maxTokens);
      r.tried = tried;
      if (sawQuota) r.degraded = `Earlier Gemini models were out of quota; answered by ${model}.`;
      return r;
    } catch (err) {
      const e = err as GeminiRouterError;
      errors.push(`${model}: ${e.message}`);
      if (isFatalAuth(e.status, e.message)) {
        lastError = errors.join(" | ");
        throw new GeminiRouterError(
          `Gemini rejected the API key (${e.message}). Check GEMINI_API_KEY on Render.`,
          e.status,
          model,
        );
      }
      if (isCreditError(e.status, e.message)) {
        sawQuota = true;
        continue; // next model - another slug may still have quota
      }
      if (isDeadSlugError(e.status, e.message)) deadKnown.add(model);
      // transient / empty / anything else: walk on down the chain
    }
  }

  lastError = errors.join(" | ");
  throw new GeminiRouterError(lastError || "All Gemini models failed", sawQuota ? 429 : 0);
}

export async function complete(opts: {
  messages: ChatMessage[];
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  /** models[0] is used ALONE - no chain, no substitution. */
  pinned?: boolean;
}): Promise<LLMResult> {
  const maxTokens = Math.max(opts.maxTokens ?? 2200, 1024);
  const base: BodyOptions = {
    messages: opts.messages,
    temperature: opts.temperature ?? 0.35,
    maxTokens,
    json: opts.json,
  };
  lastError = "";

  /* ------------------------- PINNED: one model only ------------------------- */
  if (opts.pinned && opts.models?.length) {
    const slug = bare(opts.models[0]);
    const tried: string[] = [];
    const errors: string[] = [];
    let lastStatus = 0;
    // Same slug twice: once immediately, once after a transient blip.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      tried.push(slug);
      try {
        const r = await tryModel(slug, base, maxTokens);
        r.tried = tried;
        return r;
      } catch (err) {
        const e = err as GeminiRouterError;
        errors.push(`${slug}: ${e.message}`);
        lastStatus = e.status || lastStatus;
        if (isFatalAuth(e.status, e.message) || isCreditError(e.status, e.message)) break;
        if (!isTransient(e.status, e.message)) break;
      }
    }
    lastError = errors.join(" | ");
    throw new GeminiRouterError(`${slug} could not complete the request. ${lastError.slice(0, 260)}`, lastStatus);
  }

  const models = await liveModels(modelChain(opts.models));
  try {
    return await tryChain(models, base, maxTokens);
  } catch (err) {
    const e = err as GeminiRouterError;
    if (isCreditError(e.status, e.message)) {
      return tryChain(await liveModels(unique(FREE_MODELS)), base, maxTokens);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Streaming + tool calling (used by the AI Agent tab)
 * ------------------------------------------------------------------ */

export interface LLMStreamResult {
  text: string;
  model: string;
  toolCalls: ToolCallDelta[];
  finishReason: string;
  reasoning?: string;
}

/** Historical alias. */
export type ORStreamResult = LLMStreamResult;

export function parseSseLine(line: string) {
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
  model: string,
  body: Record<string, unknown>,
  onDelta: (text: string, reasoning: string) => void,
  timeoutMs = 170000,
): Promise<LLMStreamResult> {
  const key = geminiKey();
  if (!key) throw new GeminiRouterError("GEMINI_API_KEY is not set", 0, model);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${apiBase()}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      },
    );

    if (!res.ok || !res.body) {
      const raw = await res.text().catch(() => "");
      throw errorFrom(res.status, raw, model);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let reasoning = "";
    let finishReason = "";
    const calls: ToolCallDelta[] = [];

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const evt = parseSseLine(line);
        if (!evt || (evt as { done?: boolean }).done) continue;
        const chunkJson = evt as { candidates?: Candidate[]; promptFeedback?: { blockReason?: string } };
        const candidate = chunkJson.candidates?.[0];
        if (!candidate) continue;
        for (const part of candidate.content?.parts || []) {
          if (part.functionCall?.name) {
            calls.push({
              id: `call_${calls.length}_${part.functionCall.name}`.slice(0, 120),
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            });
            continue;
          }
          if (typeof part.text !== "string" || !part.text) continue;
          if (part.thought) {
            reasoning += part.text;
            onDelta("", part.text);
          } else {
            text += part.text;
            onDelta(part.text, "");
          }
        }
        if (candidate.finishReason) finishReason = candidate.finishReason;
      }
    }

    if (!text && !calls.length) {
      throw new GeminiRouterError(`Empty streamed Gemini response (${finishReason || "no parts"})`, 200, model);
    }
    return { text, model, toolCalls: calls, finishReason, reasoning: reasoning || undefined };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new GeminiRouterError("Gemini stream timed out", 408, model);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Streaming completion with optional tool calling. Falls back down the same
 * model chain as `complete`, and drops `tools` for a model that rejects them
 * so a tool-capable request can never hard-fail.
 *
 * With `pinned: true` and exactly one model, that model is used ALONE: the
 * request goes to that slug only, and the only retries are the same slug -
 * first as sent, then without tools, then once more after a transient blip.
 * It never silently answers from a different model.
 */
export async function completeStream(opts: {
  messages: ChatMessage[];
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolCallSpec[];
  reasoning?: boolean;
  /** models[0] is used ALONE - no chain, no substitution. */
  pinned?: boolean;
  onDelta: (text: string, reasoning: string) => void;
}): Promise<LLMStreamResult> {
  const maxTokens = Math.max(opts.maxTokens ?? 2600, 1024);
  const withTools = (opts.tools || []).length > 0;
  const { system, contents } = toGeminiContents(opts.messages);

  const bodyFor = (model: string, tools: ToolCallSpec[] | undefined, thinking: "off" | "on" | "default") =>
    buildBody(
      {
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        maxTokens,
        tools,
        reasoning: opts.reasoning,
      },
      model,
      system,
      contents,
      maxTokens,
      thinking,
    );

  lastError = "";

  /* ------------------------- PINNED: one model only ------------------------- */
  if (opts.pinned && opts.models?.length === 1) {
    const slug = bare(opts.models[0]);
    const attempts: (ToolCallSpec[] | undefined)[] = withTools ? [opts.tools, undefined] : [undefined];
    const errors: string[] = [];
    for (const tools of attempts) {
      for (let retry = 0; retry < 2; retry += 1) {
        try {
          return await postStream(slug, bodyFor(slug, tools, opts.reasoning ? "on" : "off"), opts.onDelta);
        } catch (err) {
          const e = err as GeminiRouterError;
          errors.push(`${slug}${tools ? "" : " (no tools)"}${retry ? " (retry)" : ""}: ${e.message}`);
          if (isFatalAuth(e.status, e.message) || isCreditError(e.status, e.message)) {
            lastError = errors.join(" | ");
            throw new GeminiRouterError(
              `Gemini rejected ${slug} (${e.message}). Check GEMINI_API_KEY / quota on Render.`,
              e.status,
              slug,
            );
          }
          if (!isTransient(e.status, e.message)) break; // try the next attempt shape
        }
      }
    }
    lastError = errors.join(" | ");
    throw new GeminiRouterError(`${slug} could not complete the request. ${lastError.slice(0, 260)}`, 0, slug);
  }

  const chain = await liveModels(modelChain(opts.models));
  const errors: string[] = [];
  let sawQuota = false;

  for (const model of chain.filter((m) => !deadKnown.has(m))) {
    const attempts: (ToolCallSpec[] | undefined)[] = withTools ? [opts.tools, undefined] : [undefined];
    for (const tools of attempts) {
      try {
        return await postStream(model, bodyFor(model, tools, opts.reasoning ? "on" : "off"), opts.onDelta);
      } catch (err) {
        const e = err as GeminiRouterError;
        errors.push(`${model}${tools ? "" : " (no tools)"}: ${e.message}`);
        if (isFatalAuth(e.status, e.message)) {
          lastError = errors.join(" | ");
          throw new GeminiRouterError(
            `Gemini rejected the API key (${e.message}). Check GEMINI_API_KEY on Render.`,
            e.status,
            model,
          );
        }
        if (isCreditError(e.status, e.message)) {
          sawQuota = true;
          break; // next model
        }
        if (isDeadSlugError(e.status, e.message)) {
          deadKnown.add(model);
          break; // next model
        }
      }
    }
  }

  lastError = errors.join(" | ");
  throw new GeminiRouterError(
    lastError || "All Gemini models failed",
    sawQuota ? 429 : 0,
  );
}

export async function completeWithSystem(opts: {
  user: ChatContent;
  extraSystem?: string;
  history?: ChatMessage[];
  models?: string[];
  temperature?: number;
}): Promise<LLMResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: `${GHANA_CONTEXT}\n${opts.extraSystem || ""}`.trim() },
    ...(opts.history || []),
    { role: "user", content: opts.user },
  ];
  return complete({ messages, models: opts.models, temperature: opts.temperature });
}

export function fallbackGroups(models = modelChain()) {
  return chunk(models, MAX_MODELS_PER_REQUEST);
}
