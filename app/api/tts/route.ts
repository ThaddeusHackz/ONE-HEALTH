import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/body";
import {
  elevenLabsKey,
  elevenLabsVoice,
  openRouterKey,
  openRouterReferer,
  openRouterTitle,
} from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Speech output with three tiers:
 *   1. ElevenLabs multilingual v2  (ELEVENLABS_API_KEY) - the good voice
 *   2. OpenRouter /audio/speech    (OPENROUTER_API_KEY)  - same key, one bill
 *   3. Browser speechSynthesis     (no key)              - handled client-side
 */

const ROUTER_TTS_MODELS = ["openai/tts-1", "elevenlabs/eleven_v3", "openai/gpt-4o-mini-tts"];

export async function POST(req: Request) {
  const read = await readJsonBody(req, 32_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as {
    text?: string;
    voice?: string;
    engine?: "elevenlabs" | "openrouter" | "auto";
  };
  const text = (body.text || "").trim().slice(0, 2500);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const eleven = elevenLabsKey();
  const router = openRouterKey();
  const preferred = body.engine || "auto";

  if (eleven && preferred !== "openrouter") {
    const voice = body.voice || elevenLabsVoice();
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "xi-api-key": eleven,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.75 },
      }),
    });
    if (res.ok) {
      return audioResponse(await res.arrayBuffer(), `elevenlabs:${voice}`);
    }
  }

  if (router) {
    for (const model of ROUTER_TTS_MODELS) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${router}`,
            "Content-Type": "application/json",
            "HTTP-Referer": openRouterReferer(),
            "X-Title": openRouterTitle(),
          },
          body: JSON.stringify({ model, input: text, voice: body.voice || "alloy", response_format: "mp3" }),
        });
        if (!res.ok) continue;
        const ctype = res.headers.get("content-type") || "";
        if (ctype.includes("audio")) return audioResponse(await res.arrayBuffer(), `openrouter:${model}`);
      } catch {
        /* try the next model */
      }
    }
  }

  return NextResponse.json({
    fallback: "browser",
    note: "No ElevenLabs or OpenRouter speech available. The client will use the device speech synthesizer.",
  });
}

function audioResponse(buf: ArrayBuffer, engine: string) {
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-TTS-Engine": engine,
    },
  });
}
