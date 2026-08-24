import { NextResponse } from "next/server";
import { openRouterKey, openRouterReferer, openRouterTitle, whisperKey } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Speech-to-text with three tiers:
 *   1. OpenAI Whisper directly   (OPENAI_API_KEY)     - whisper-1 / gpt-4o-mini-transcribe
 *   2. OpenRouter audio route    (OPENROUTER_API_KEY) - openai/whisper-large-v3 + fallbacks
 *   3. Browser Web Speech API    (no key at all)      - handled client-side
 */

const OPENROUTER_STT_MODELS = [
  "openai/whisper-large-v3",
  "openai/whisper-1",
  "google/gemini-2.5-flash",
];

const OPENAI_STT_MODELS = ["gpt-4o-mini-transcribe", "whisper-1"];

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }
  const language = String(form.get("language") || "").trim();
  const direct = whisperKey();
  const router = openRouterKey();

  if (!direct && !router) {
    return NextResponse.json({
      text: "",
      engine: "none",
      note: "No Whisper key. The browser microphone (Web Speech API) still works for English and several Ghana-relevant accents depending on the device.",
    });
  }

  const errors: string[] = [];

  if (direct) {
    for (const model of OPENAI_STT_MODELS) {
      const out = await postMultipart(
        "https://api.openai.com/v1/audio/transcriptions",
        { Authorization: `Bearer ${direct}` },
        { model, file, language },
      );
      if (out.ok) return NextResponse.json({ text: out.text, model, engine: "openai" });
      errors.push(`openai:${model}: ${out.error}`);
    }
  }

  if (router) {
    for (const model of OPENROUTER_STT_MODELS) {
      const out = await postMultipart(
        "https://openrouter.ai/api/v1/audio/transcriptions",
        {
          Authorization: `Bearer ${router}`,
          "HTTP-Referer": openRouterReferer(),
          "X-Title": openRouterTitle(),
        },
        { model, file, language },
      );
      if (out.ok) return NextResponse.json({ text: out.text, model, engine: "openrouter" });
      errors.push(`openrouter:${model}: ${out.error}`);
    }
  }

  return NextResponse.json({
    text: "",
    engine: "none",
    note: `Whisper unavailable - use the browser microphone. (${errors.slice(0, 3).join(" | ")})`,
  });
}

async function postMultipart(
  url: string,
  headers: Record<string, string>,
  opts: { model: string; file: File; language: string },
): Promise<{ ok: boolean; text: string; error: string }> {
  const forward = new FormData();
  forward.set("model", opts.model);
  forward.set("file", opts.file, opts.file.name || "speech.webm");
  if (opts.language) forward.set("language", opts.language);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60000);
    const res = await fetch(url, { method: "POST", headers, body: forward, signal: ctrl.signal });
    clearTimeout(timer);
    const json = (await res.json().catch(() => ({}))) as {
      text?: string;
      error?: { message?: string } | string;
    };
    const text = typeof json.text === "string" ? json.text.trim() : "";
    if (res.ok && text) return { ok: true, text, error: "" };
    const message =
      typeof json.error === "string" ? json.error : json.error?.message || `HTTP ${res.status}`;
    return { ok: false, text: "", error: message };
  } catch (err) {
    return { ok: false, text: "", error: (err as Error).message };
  }
}
