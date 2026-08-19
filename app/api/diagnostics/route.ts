import { NextResponse } from "next/server";
import {
  elevenLabsKey,
  maskKey,
  openRouterKey,
  openRouterReferer,
  openRouterTitle,
  openWeatherKey,
  tavilyKey,
} from "@/lib/env";

export const dynamic = "force-dynamic";

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
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": openRouterReferer(),
          "X-Title": openRouterTitle(),
        },
        body: JSON.stringify({
          model: "openrouter/auto",
          models: [
            "google/gemini-2.5-flash",
            "openai/gpt-4.1-mini",
            "openai/gpt-4o-mini",
            "meta-llama/llama-3.3-70b-instruct:free",
            "openrouter/auto",
          ],
          provider: { allow_fallbacks: true },
          messages: [{ role: "user", content: "Reply with exactly OPENROUTER_OK" }],
          max_tokens: 16,
        }),
      });
      const json = (await res.json()) as { error?: { message?: string }; model?: string; choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content || json.error?.message || "";
      return { id: "openrouter", ok: res.ok && /OPENROUTER_OK/i.test(text), status: res.status, detail: text.slice(0, 180) || json.model || "", masked: maskKey(key) };
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
      const res = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
      const json = (await res.json()) as { subscription?: { tier?: string }; detail?: { status?: string } | string };
      const detail = typeof json.detail === "string" ? json.detail : json.detail?.status || json.subscription?.tier || res.statusText;
      return { id: "elevenlabs", ok: res.ok, status: res.status, detail: String(detail), masked: maskKey(key) };
    }),
  );

  return NextResponse.json({ time: new Date().toISOString(), checks });
}
