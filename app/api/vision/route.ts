import { NextResponse } from "next/server";
import { openRouterConfigured, visionAnalyze } from "@/lib/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    images?: string[];
    prompt?: string;
    kind?: "clinical" | "document" | "lab" | "environment";
  };
  const images = (body.images || []).filter((x) => typeof x === "string" && x.startsWith("data:")).slice(0, 6);
  if (!images.length) {
    return NextResponse.json({ error: "Attach at least one image or scanned page (data URL)." }, { status: 400 });
  }
  if (!openRouterConfigured()) {
    return NextResponse.json({
      model: "offline",
      text: offlineVision(body.kind),
    });
  }

  const kind = body.kind || "document";
  const prompt = `${body.prompt || defaultPrompt(kind)}

Return markdown with:
1. What the file actually shows (no invention)
2. Structured fields (disease/condition, geography in Ghana if present, dates, counts, facility)
3. Data-quality flags (blur, cropped stamp, unreadable figures, possible identifiers)
4. One Health relevance for Ghana Health Service
5. Confidence (low / moderate / high) and what would raise it
6. Recommended next human verification step

If a face or name is visible, do NOT repeat identifiers. Say “possible identifier present — redact before sharing further.”`;

  try {
    const result = await visionAnalyze({
      prompt,
      images,
      extraSystem:
        "You are a Ghana Health Service document and medical-image reviewer. Extract; do not diagnose an individual. Never claim certainty from a photo.",
    });
    return NextResponse.json({ text: result.text, model: result.model });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, text: offlineVision(kind), model: "offline" });
  }
}

function defaultPrompt(kind: string) {
  if (kind === "clinical") return "Review this clinical or field photograph for public-health surveillance clues in Ghana.";
  if (kind === "lab") return "Read this laboratory or RDT result sheet as a surveillance document.";
  if (kind === "environment") return "Interpret this environmental or veterinary scene for One Health risk in Ghana.";
  return "Read this public-health document, form, chart, or scanned page.";
}

function offlineVision(kind?: string) {
  return `**Vision is in offline mode**

The greatest vision path uses OpenRouter’s fallback chain (Gemini → GPT-4.1 → Claude and others) on the server. Set \`OPENROUTER_API_KEY\` and re-upload.

Meanwhile, treat any ${kind || "document"} as:
- a source to be catalogued (date, region, disease, counts)
- not a diagnosis
- not an outbreak confirmation

Redact names, phone numbers, folder numbers, and faces before a live run.`;
}
