import { NextResponse } from "next/server";
import { generateImage, IMAGE_MODEL_CHAIN, unsplashSearch } from "@/lib/agent/media";
import { openRouterConfigured } from "@/lib/openrouter";
import { recordAudit } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export function GET() {
  return NextResponse.json({
    configured: openRouterConfigured(),
    imageModels: IMAGE_MODEL_CHAIN,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
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
