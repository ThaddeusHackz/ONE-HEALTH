import { NextResponse } from "next/server";
import { GEMINI_IMAGE_MODEL_CHAIN, generateImage, unsplashSearch } from "@/lib/agent/media";
import { geminiKey } from "@/lib/env";
import { recordAudit } from "@/lib/store";
import { readJsonBody } from "@/lib/body";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export function GET() {
  return NextResponse.json({
    configured: Boolean(geminiKey()),
    engine: "gemini",
    imageModels: GEMINI_IMAGE_MODEL_CHAIN,
  });
}

export async function POST(req: Request) {
  const read = await readJsonBody(req, 12_000_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as {
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    reference?: string;
    stock?: boolean;
    count?: number;
  };

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  if (body.stock) {
    const { images, engine } = await unsplashSearch(body.prompt, body.count || 6);
    return NextResponse.json({ images, engine });
  }

  try {
    const image = await generateImage({
      prompt: body.prompt,
      model: body.model,
      aspectRatio: body.aspectRatio,
      reference: body.reference?.startsWith("data:") ? body.reference : undefined,
    });
    recordAudit({
      actor: "agent",
      action: "image_generate",
      model: image.model,
      redactions: 0,
      detail: body.prompt.slice(0, 90),
    });
    return NextResponse.json({ image });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
