import { NextResponse } from "next/server";
import { openRouterKey, openRouterReferer, openRouterTitle } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = openRouterKey();
  if (!key) {
    return NextResponse.json({
      text: "",
      note: "No OpenRouter key. Use the browser microphone (Web Speech API) — it works offline for English and several Ghana-relevant accents depending on the device.",
    });
  }

  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "audio file required" }, { status: 400 });
  }

  const forward = new FormData();
  forward.set("model", "openai/whisper-large-v3");
  forward.set("file", file, file.name || "speech.webm");

  try {
    const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": openRouterReferer(),
        "X-Title": openRouterTitle(),
      },
      body: forward,
    });
    const json = (await res.json()) as { text?: string; error?: { message?: string } };
    if (!res.ok) {
      return NextResponse.json({
        text: "",
        note: json.error?.message || "Whisper unavailable — use browser voice instead.",
      });
    }
    return NextResponse.json({ text: json.text || "", model: "openai/whisper-large-v3" });
  } catch (err) {
    return NextResponse.json({ text: "", note: (err as Error).message });
  }
}
