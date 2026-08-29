import { NextResponse } from "next/server";
import { geminiKey } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Speech-to-text on the Gemini API - the platform's single AI key.
 *
 *   1. Gemini audio understanding (GEMINI_API_KEY): the clip travels as an
 *      inlineData part to :generateContent, which returns a verbatim
 *      transcript. Walks a model fallback chain.
 *   2. Browser Web Speech API (no key at all) - handled client-side.
 *
 * Gemini natively accepts wav, mp3, aiff, aac, ogg and flac. WebM/Opus (what
 * MediaRecorder produces in Chrome) is sent as audio/ogg, which Google's
 * decoder accepts for Opus payloads.
 */

const GEMINI_STT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"];

function apiBase(): string {
  const raw = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").trim();
  return raw.replace(/\/+$/, "");
}

/** Map a browser recording MIME to one Gemini's audio decoder accepts. */
function audioMime(type: string): string {
  const t = (type || "").split(";")[0].trim().toLowerCase();
  if (/webm|ogg|opus/.test(t)) return "audio/ogg";
  if (/mp4|m4a|aac/.test(t)) return "audio/aac";
  if (/mpeg|mp3/.test(t)) return "audio/mp3";
  if (/wav|x-wav|wave/.test(t)) return "audio/wav";
  if (/flac/.test(t)) return "audio/flac";
  if (/aiff/.test(t)) return "audio/aiff";
  return "audio/ogg";
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }
  // Inline request payloads are capped at 20 MB by the Gemini API; refusing
  // anything larger protects the instance before the clip is base64-expanded.
  if (file.size > 18 * 1024 * 1024) {
    return NextResponse.json(
      { error: `Audio too large (${(file.size / 1e6).toFixed(1)} MB) - keep clips under 18 MB.` },
      { status: 413 },
    );
  }
  const language = String(form.get("language") || "").trim();
  const key = geminiKey();

  if (!key) {
    return NextResponse.json({
      text: "",
      engine: "none",
      note: "No GEMINI_API_KEY. The browser microphone (Web Speech API) still works for English and several Ghana-relevant accents depending on the device.",
    });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mimeType = audioMime(file.type);
  const prompt =
    `Transcribe this audio verbatim.` +
    (language ? ` The speaker is using language code ${language}.` : "") +
    ` Return ONLY the transcript text - no preamble, no speaker labels, no timestamps, no commentary.` +
    ` If the audio contains no intelligible speech, return an empty response.`;

  const errors: string[] = [];

  for (const model of GEMINI_STT_MODELS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      const res = await fetch(`${apiBase()}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const raw = await res.text().catch(() => "");
      let json: {
        error?: { message?: string };
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      } = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        /* non-JSON error page */
      }
      if (!res.ok) {
        errors.push(`gemini:${model}: ${json.error?.message || `HTTP ${res.status}`}`);
        continue;
      }
      const text = (json.candidates?.[0]?.content?.parts || [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text || "")
        .join("")
        .trim();
      if (text) return NextResponse.json({ text, model, engine: "gemini" });
      errors.push(`gemini:${model}: empty transcript`);
    } catch (err) {
      errors.push(`gemini:${model}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    text: "",
    engine: "none",
    note: `Gemini transcription unavailable - use the browser microphone. (${errors.slice(0, 3).join(" | ")})`,
  });
}
