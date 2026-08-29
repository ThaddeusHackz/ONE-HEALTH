import { NextResponse } from "next/server";
import {
  elevenLabsKey,
  elevenLabsVoice,
  geminiKey,
  maskKey,
  openWeatherKey,
  tavilyKey,
  unsplashKey,
} from "@/lib/env";
import { GEMINI_IMAGE_MODEL_CHAIN, listGeminiModels } from "@/lib/agent/media";
import { geminiPing, geminiVision } from "@/lib/agent/gemini";
import {
  CHAT_MODELS,
  FREE_MODELS,
  lastGeminiError,
  modelCatalogueStatus,
} from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Check {
  id: string;
  ok: boolean;
  status: number | string;
  detail: string;
  masked: string;
}

async function probe(id: string, masked: string, fn: () => Promise<Check>): Promise<Check> {
  try {
    return await fn();
  } catch (err) {
    return { id, ok: false, status: "network", detail: (err as Error).message, masked };
  }
}

export async function GET() {
  const checks: Check[] = [];

  checks.push(
    await probe("gemini-brain", maskKey(geminiKey()), async () => {
      const key = geminiKey();
      if (!key) {
        return {
          id: "gemini-brain",
          ok: false,
          status: 0,
          detail:
            "missing GEMINI_API_KEY - the whole engine (chat, tools, vision, research, images, speech) runs on this one key",
          masked: "not set",
        };
      }
      // One real generateContent call through the shipped engine, chain and all.
      const ping = await geminiPing();
      return {
        id: "gemini-brain",
        ok: ping.ok,
        status: ping.ok ? 200 : 0,
        detail: ping.ok ? ping.detail : (ping.detail || lastGeminiError() || "").slice(0, 220),
        masked: maskKey(key),
      };
    }),
  );

  checks.push(
    await probe("tavily", maskKey(tavilyKey()), async () => {
      const key = tavilyKey();
      if (!key) return { id: "tavily", ok: false, status: 0, detail: "missing key", masked: "not set" };
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key, query: "Ghana Health Service", max_results: 1 }),
      });
      const json = (await res.json()) as { error?: string; results?: { title?: string }[] };
      return {
        id: "tavily",
        ok: res.ok && Boolean(json.results?.length),
        status: res.status,
        detail: json.error || json.results?.[0]?.title || "no hits",
        masked: maskKey(key),
      };
    }),
  );

  checks.push(
    await probe("openweather", maskKey(openWeatherKey()), async () => {
      const key = openWeatherKey();
      if (!key) return { id: "openweather", ok: false, status: 0, detail: "missing key", masked: "not set" };
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Accra,GH&appid=${key}&units=metric`);
      const json = (await res.json()) as { name?: string; main?: { temp?: number }; message?: string };
      return {
        id: "openweather",
        ok: res.ok && Boolean(json.name),
        status: res.status,
        detail: json.message || `${json.name || ""} ${json.main?.temp ?? ""}°C`.trim(),
        masked: maskKey(key),
      };
    }),
  );

  checks.push(
    await probe("elevenlabs", maskKey(elevenLabsKey()), async () => {
      const key = elevenLabsKey();
      if (!key) return { id: "elevenlabs", ok: false, status: 0, detail: "missing key", masked: "not set" };
      // Restricted keys often cannot read /v1/user (missing_permissions) but can still speak.
      const voices = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
      if (voices.ok) {
        const json = (await voices.json()) as { voices?: { voice_id?: string; name?: string }[] };
        const preferred = elevenLabsVoice();
        const hit = json.voices?.find((v) => v.voice_id === preferred);
        return {
          id: "elevenlabs",
          ok: true,
          status: 200,
          detail: hit
            ? `voices ok · using ${hit.name || preferred}`
            : `voices ok · ${json.voices?.length || 0} available (voice ${preferred})`,
          masked: maskKey(key),
        };
      }
      const user = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
      const json = (await user.json()) as { subscription?: { tier?: string }; detail?: { status?: string } | string };
      const detail =
        typeof json.detail === "string" ? json.detail : json.detail?.status || json.subscription?.tier || user.statusText;
      return { id: "elevenlabs", ok: user.ok, status: user.status, detail: String(detail), masked: maskKey(key) };
    }),
  );

  checks.push(
    await probe("unsplash", maskKey(unsplashKey()), async () => {
      const key = unsplashKey();
      if (!key) {
        return { id: "unsplash", ok: false, status: 0, detail: "missing key - image search falls back to Tavily images", masked: "not set" };
      }
      const res = await fetch("https://api.unsplash.com/search/photos?query=ghana+health&per_page=1", {
        headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      });
      const json = (await res.json()) as { total?: number; errors?: string[] };
      return {
        id: "unsplash",
        ok: res.ok && Boolean(json.total),
        status: res.status,
        detail: res.ok ? `${json.total || 0} photos match "ghana health"` : (json.errors?.[0] || res.statusText),
        masked: maskKey(key),
      };
    }),
  );

  checks.push(
    await probe("gemini-vision", maskKey(geminiKey()), async () => {
      const key = geminiKey();
      if (!key) {
        return {
          id: "gemini-vision",
          ok: false,
          status: 0,
          detail: "missing GEMINI_API_KEY - vision (all document/photo reads) and deep research run on this key",
          masked: "not set",
        };
      }
      // A real multimodal read: a 1x1 PNG travels as inlineData, proving the
      // vision path (not just text generation) works with this key.
      const pixel =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      const r = await geminiVision({
        prompt: "Reply with exactly VISION_OK.",
        images: [pixel],
        maxTokens: 2048,
      });
      const ok = /VISION_OK/i.test(r.text);
      return {
        id: "gemini-vision",
        ok,
        status: ok ? 200 : 0,
        detail: ok ? `${r.model} read an inline image and answered VISION_OK` : r.text.slice(0, 160),
        masked: maskKey(key),
      };
    }),
  );

  checks.push(
    await probe("image-generation", maskKey(geminiKey()), async () => {
      const key = geminiKey();
      if (!key) {
        return {
          id: "image-generation",
          ok: false,
          status: 0,
          detail: "missing GEMINI_API_KEY - image generation is Gemini-only",
          masked: "not set",
        };
      }
      const { ok, models, error } = await listGeminiModels();
      const overlap = GEMINI_IMAGE_MODEL_CHAIN.filter((m) => models.includes(m));
      return {
        id: "image-generation",
        ok: ok && overlap.length > 0,
        status: ok ? 200 : 0,
        detail: ok
          ? `${models.length} image-output models on the key; ${overlap.length} of our chain reachable${
              overlap.length ? ` (${overlap[0]})` : ""
            }`
          : error || "no image-output models reachable with this key",
        masked: maskKey(key),
      };
    }),
  );

  checks.push(
    await probe("transcription", maskKey(geminiKey()), async () => {
      const key = geminiKey();
      return {
        id: "transcription",
        ok: Boolean(key),
        status: key ? 200 : 0,
        detail: key
          ? "speech-to-text runs on the Gemini key (audio inlineData → generateContent)"
          : "no GEMINI_API_KEY - the browser Web Speech API is the only transcriber",
        masked: key ? maskKey(key) : "not set",
      };
    }),
  );

  checks.push(
    await probe("model-chain", "-", async () => {
      const chain = Array.from(new Set([...CHAT_MODELS, ...FREE_MODELS]));
      const status = await modelCatalogueStatus(chain);
      if (!status.reachable) {
        return {
          id: "model-chain",
          ok: false,
          status: "unreachable",
          detail: `Google's model catalogue could not be reached - the ${chain.length}-slug Gemini chain runs unfiltered (a retired slug is still skipped at request time).`,
          masked: "-",
        };
      }
      return {
        id: "model-chain",
        ok: status.live.length > 0,
        status: 200,
        detail:
          `${status.live.length}/${chain.length} fallback-chain slugs live on the catalogue (${status.total} models total)` +
          (status.dead.length ? ` · retired (auto-skipped): ${status.dead.join(", ")}` : ""),
        masked: "-",
      };
    }),
  );

  return NextResponse.json({ time: new Date().toISOString(), checks });
}
