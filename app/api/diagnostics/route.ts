import { NextResponse } from "next/server";
import {
  elevenLabsKey,
  elevenLabsVoice,
  maskKey,
  openRouterKey,
  openRouterReferer,
  openRouterTitle,
  openWeatherKey,
  tavilyKey,
  unsplashKey,
  whisperKey,
} from "@/lib/env";
import { GEMINI_IMAGE_MODEL_CHAIN, listGeminiModels } from "@/lib/agent/media";
import { geminiPing } from "@/lib/agent/gemini";
import { geminiKey } from "@/lib/env";
import {
  CHAT_MODELS,
  FREE_MODELS,
  lastOpenRouterError,
  MAX_MODELS_PER_REQUEST,
  modelCatalogueStatus,
} from "@/lib/openrouter";

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
    await probe("openrouter", maskKey(openRouterKey()), async () => {
      const key = openRouterKey();
      if (!key) return { id: "openrouter", ok: false, status: 0, detail: "missing key", masked: "not set" };
      const models = ["google/gemini-2.5-flash", "openai/gpt-4.1-mini", "openai/gpt-4o-mini"].slice(
        0,
        MAX_MODELS_PER_REQUEST,
      );
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": openRouterReferer(),
          "X-Title": openRouterTitle(),
        },
        body: JSON.stringify({
          model: models[0],
          models,
          provider: { allow_fallbacks: true },
          messages: [{ role: "user", content: "Reply with exactly OPENROUTER_OK" }],
          max_tokens: 16,
        }),
      });
      const json = (await res.json()) as {
        error?: { message?: string };
        model?: string;
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content || json.error?.message || "";
      const ok = res.ok && /OPENROUTER_OK/i.test(text);
      return {
        id: "openrouter",
        ok,
        status: res.status,
        detail: ok
          ? `${json.model || models[0]} answered OPENROUTER_OK`
          : (text || json.model || lastOpenRouterError() || "").slice(0, 220),
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
    await probe("gemini", maskKey(geminiKey()), async () => {
      const key = geminiKey();
      if (!key) {
        return {
          id: "gemini",
          ok: false,
          status: 0,
          detail: "missing GEMINI_API_KEY - the vision engine (all document/photo reads), deep research and image generation run ONLY on this key",
          masked: "not set",
        };
      }
      // One real generateContent call: proves the key is valid AND that a
      // thinking model actually returns text with our generation config.
      const ping = await geminiPing();
      return {
        id: "gemini",
        ok: ping.ok,
        status: ping.ok ? 200 : 0,
        detail: ping.detail,
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
    await probe("whisper", maskKey(whisperKey()), async () => {
      const key = whisperKey();
      if (!key) {
        return {
          id: "whisper",
          ok: Boolean(openRouterKey()),
          status: 0,
          detail: openRouterKey()
            ? "no direct OpenAI key - transcription routes through OpenRouter"
            : "no key - browser Web Speech API only",
          masked: "not set",
        };
      }
      const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
      return {
        id: "whisper",
        ok: res.ok,
        status: res.status,
        detail: res.ok ? "OpenAI key valid - Whisper available" : "OpenAI key rejected",
        masked: maskKey(key),
      };
    }),
  );

  checks.push(
    await probe("model-chain", "-", async () => {
      const chain = [...CHAT_MODELS, ...FREE_MODELS];
      const status = await modelCatalogueStatus(chain);
      if (!status.reachable) {
        return {
          id: "model-chain",
          ok: false,
          status: "unreachable",
          detail: `OpenRouter's public model catalogue could not be reached - the ${chain.length}-slug chain runs unfiltered (each group still recovers from retired slugs at request time).`,
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
