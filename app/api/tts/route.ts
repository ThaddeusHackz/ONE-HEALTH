import { NextResponse } from "next/server";
import { elevenLabsKey, elevenLabsVoice } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text || "").trim().slice(0, 2500);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const key = elevenLabsKey();
  if (!key) {
    return NextResponse.json({
      fallback: "browser",
      note: "No ElevenLabs key. The client will use the device speech synthesizer.",
    });
  }

  const voice = elevenLabsVoice();
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ fallback: "browser", note: `ElevenLabs ${res.status}` });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
