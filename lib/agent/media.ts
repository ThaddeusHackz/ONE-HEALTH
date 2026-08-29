import { geminiImageModels, geminiKey, unsplashKey } from "@/lib/env";

/* ------------------------------------------------------------------ *
 * Stock imagery - Unsplash first, Tavily image results as fallback.
 * ------------------------------------------------------------------ */

export interface StockImage {
  url: string;
  thumb: string;
  alt: string;
  author: string;
  link: string;
  source: "unsplash" | "tavily";
}

export async function unsplashSearch(query: string, count = 6): Promise<{ images: StockImage[]; engine: string }> {
  const key = unsplashKey();
  const per = Math.min(Math.max(count, 1), 12);
  if (key) {
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
        query,
      )}&per_page=${per}&orientation=landscape&content_filter=high`;
      const res = await fetch(url, {
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          results?: {
            urls?: { regular?: string; small?: string; raw?: string };
            alt_description?: string | null;
            description?: string | null;
            links?: { html?: string };
            user?: { name?: string };
          }[];
        };
        const images = (json.results || []).map((r) => ({
          url: r.urls?.regular || r.urls?.raw || "",
          thumb: r.urls?.small || r.urls?.regular || "",
          alt: r.alt_description || r.description || query,
          author: r.user?.name || "Unsplash",
          link: r.links?.html || "https://unsplash.com",
          source: "unsplash" as const,
        })).filter((i) => i.url);
        if (images.length) return { images, engine: "unsplash" };
      }
    } catch {
      /* fall through to Tavily */
    }
  }

  // No Unsplash key (or an exhausted one): reuse Tavily's image results.
  try {
    const tavilyKey = process.env.TAVILY_API_KEY || process.env.TAVILY_KEY || "";
    if (!tavilyKey) return { images: [], engine: "none" };
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tavilyKey}` },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: `${query} photograph`,
        max_results: 5,
        include_images: true,
        include_image_descriptions: true,
      }),
    });
    if (!res.ok) return { images: [], engine: "none" };
    const json = (await res.json()) as { images?: { url?: string; description?: string }[] | string[] };
    const images = (json.images || [])
      .map((img) =>
        typeof img === "string"
          ? { url: img, alt: query, source: "tavily" as const }
          : { url: img.url || "", alt: img.description || query, source: "tavily" as const },
      )
      .filter((i) => i.url)
      .map((i) => ({ ...i, thumb: i.url, author: "Web", link: i.url, source: "tavily" as const }));
    return { images: images.slice(0, per), engine: images.length ? "tavily-images" : "none" };
  } catch {
    return { images: [], engine: "none" };
  }
}

/* ------------------------------------------------------------------ *
 * AI image generation - Gemini API only.
 *
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header  x-goog-api-key: <key>
 *   body    { contents:[{role:"user",parts:[{text},{inline_data?}]}],
 *             generationConfig:{ responseModalities:["TEXT","IMAGE"], ... } }
 *   image   candidates[0].content.parts[].inlineData.data  (base64)
 *
 * REST responses use snake_case (`inline_data`) and the SDK/JSON-mapped shape
 * uses camelCase (`inlineData`); both are handled below.
 *
 * Imagen is deliberately NOT in the chain: Google shut the Imagen endpoints
 * down on 2026-08-17, so calling :predict would only produce dead-model errors.
 * ------------------------------------------------------------------ */

export const GEMINI_IMAGE_MODEL_CHAIN = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image-preview",
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image-preview",
];

/** Same override hook as gemini.ts - lets the forensic mock stand in for Google. */
function geminiBase(): string {
  const raw = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").trim();
  return raw.replace(/\/+$/, "");
}

export interface GeneratedImage {
  dataUrl: string;
  model: string;
  prompt: string;
  bytes: number;
  note?: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string; code?: number };
}

/**
 * Pull the first image out of a Gemini generateContent response.
 * Exported so the parser is unit-testable without a network call.
 */
export function extractGeminiImage(json: GeminiResponse): { b64: string; mime: string } | null {
  const parts = json.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const camel = part.inlineData;
    const snake = part.inline_data;
    const data = camel?.data || snake?.data;
    if (data) return { b64: data, mime: camel?.mimeType || snake?.mime_type || "image/png" };
  }
  return null;
}

/** Reads the human-readable reason a Gemini image request failed. */
export function geminiFailure(json: GeminiResponse, status: number): string {
  if (json.error?.message) return `${status}: ${json.error.message}`;
  const block = json.promptFeedback?.blockReason;
  if (block) return `${status}: prompt blocked (${block})`;
  const finish = json.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP") return `${status}: finished without an image (${finish})`;
  return `${status}: no image data in response`;
}

function splitDataUrl(reference: string): { mime: string; data: string } | null {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(reference);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

function aspectConfig(aspectRatio?: string): Record<string, unknown> | null {
  if (!aspectRatio) return null;
  return {
    responseModalities: ["TEXT", "IMAGE"],
    responseFormat: { image: { aspectRatio } },
  };
}

export async function generateImage(opts: {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  size?: string;
  reference?: string;
}): Promise<GeneratedImage> {
  const key = geminiKey();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set - image generation runs on the Gemini API. Add it on Render (dashboard → Environment).",
    );
  }

  const chain = [opts.model, ...geminiImageModels(), ...GEMINI_IMAGE_MODEL_CHAIN]
    .filter((m): m is string => Boolean(m))
    .filter((m, i, arr) => arr.indexOf(m) === i);

  const prompt = opts.prompt.slice(0, 4000);
  const reference = opts.reference ? splitDataUrl(opts.reference) : null;
  const parts: GeminiPart[] = reference
    ? [
        { text: prompt },
        { inline_data: { mime_type: reference.mime, data: reference.data } },
      ]
    : [{ text: prompt }];

  const errors: string[] = [];

  for (const model of chain) {
    // Aspect-ratio support differs across Gemini image model generations, so a
    // rejection of the config is retried once without it rather than failing.
    const attempts: Record<string, unknown>[] = [
      { contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } },
    ];
    const withAspect = aspectConfig(opts.aspectRatio);
    if (withAspect) {
      attempts.unshift({ contents: [{ role: "user", parts }], generationConfig: withAspect });
    }

    for (const body of attempts) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 120000);
        const res = await fetch(`${geminiBase()}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        const json = (await res.json().catch(() => ({}))) as GeminiResponse;

        if (res.ok) {
          const image = extractGeminiImage(json);
          if (image) {
            const buf = Buffer.from(image.b64, "base64");
            const mime = image.mime.startsWith("image/") ? image.mime : "image/png";
            return {
              dataUrl: `data:${mime};base64,${image.b64}`,
              model,
              prompt,
              bytes: buf.length,
              note: opts.aspectRatio ? `aspect ${opts.aspectRatio}` : undefined,
            };
          }
          errors.push(`${model}: ${geminiFailure(json, res.status)}`);
        } else {
          const message = geminiFailure(json, res.status);
          errors.push(`${model}: ${message}`);
          // A malformed generationConfig is worth one retry without it; anything
          // else (auth, quota, model gone) should not burn the whole chain.
          const configRejected =
            res.status === 400 && /responseFormat|aspectRatio|imageConfig|generationConfig|Invalid JSON/i.test(message);
          if (!configRejected) {
            if (res.status === 401 || res.status === 403) {
              throw new Error(`Gemini rejected the API key (${message}). Check GEMINI_API_KEY on Render.`);
            }
            if (res.status === 429) {
              errors.push(`${model}: rate limited - trying the next model`);
            }
            break; // next model
          }
        }
      } catch (err) {
        const message = (err as Error).message;
        if (/rejected the API key/i.test(message)) throw err;
        errors.push(`${model}: ${message}`);
        break; // network/timeout - try the next model
      }
    }
  }

  throw new Error(`Gemini image generation failed. ${errors.slice(0, 4).join(" | ")}`);
}

/** Lists the models a Gemini key can reach - used by /api/diagnostics. */
export async function listGeminiModels(): Promise<{ ok: boolean; models: string[]; error: string }> {
  const key = geminiKey();
  if (!key) return { ok: false, models: [], error: "GEMINI_API_KEY not set" };
  try {
    const res = await fetch(`${geminiBase()}/models?pageSize=200`, {
      headers: { "x-goog-api-key": key },
    });
    const json = (await res.json()) as {
      models?: { name?: string; outputModalities?: string[] }[];
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, models: [], error: json.error?.message || `HTTP ${res.status}` };
    const models = (json.models || [])
      .filter((m) => (m.outputModalities || []).some((o) => /image/i.test(o)))
      .map((m) => (m.name || "").replace(/^models\//, ""))
      .filter(Boolean);
    return { ok: true, models, error: "" };
  } catch (err) {
    return { ok: false, models: [], error: (err as Error).message };
  }
}
