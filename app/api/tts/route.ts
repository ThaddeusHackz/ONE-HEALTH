import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/body";
import { elevenLabsKey, elevenLabsVoice, geminiKey, geminiVoice } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Speech output with three tiers:
 *   1. ElevenLabs multilingual v2  (ELEVENLABS_API_KEY) - the premium voice
 *   2. Gemini TTS                  (GEMINI_API_KEY)     - the platform key
 *   3. Browser speechSynthesis     (no key)             - handled client-side
 *
 * Gemini TTS returns raw signed 16-bit PCM at 24 kHz, so a WAV header is
 * prepended here and the browser gets a playable audio/wav response.
 */

const GEMINI_TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];

function apiBase(): string {
  const raw = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").trim();
  return raw.replace(/\/+$/, "");
}

/** Wrap raw PCM (s16le) in a minimal RIFF/WAVE container. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Pull the sample rate out of a Gemini audio mime like "audio/L16;rate=24000". */
function rateFrom(mime: string): number {
  const m = /rate=(\d+)/i.exec(mime || "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 24000;
}

export async function POST(req: Request) {
  const read = await readJsonBody(req, 32_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as {
    text?: string;
    voice?: string;
    engine?: "elevenlabs" | "gemini" | "auto";
  };
  const text = (body.text || "").trim().slice(0, 2500);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const eleven = elevenLabsKey();
  const gemini = geminiKey();
  const preferred = body.engine || "auto";

  if (eleven && preferred !== "gemini") {
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
      return audioResponse(Buffer.from(await res.arrayBuffer()), `elevenlabs:${voice}`, "audio/mpeg");
    }
  }

  if (gemini) {
    const voiceName = body.voice && /^[A-Za-z]+$/.test(body.voice) ? body.voice : geminiVoice();
    for (const model of GEMINI_TTS_MODELS) {
      try {
        const res = await fetch(`${apiBase()}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": gemini },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as {
          candidates?: {
            content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }[] };
          }[];
        };
        for (const part of json.candidates?.[0]?.content?.parts || []) {
          const data = part.inlineData?.data || part.inline_data?.data;
          const mime = part.inlineData?.mimeType || part.inline_data?.mime_type || "audio/L16;rate=24000";
          if (!data) continue;
          const buf = Buffer.from(data, "base64");
          if (/wav/i.test(mime)) return audioResponse(buf, `gemini:${model}`, "audio/wav");
          return audioResponse(pcmToWav(buf, rateFrom(mime)), `gemini:${model}:${voiceName}`, "audio/wav");
        }
      } catch {
        /* try the next model */
      }
    }
  }

  return NextResponse.json({
    fallback: "browser",
    note: "No ElevenLabs or Gemini speech available. The client will use the device speech synthesizer.",
  });
}

function audioResponse(buf: Buffer, engine: string, contentType: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-TTS-Engine": engine,
    },
  });
}
