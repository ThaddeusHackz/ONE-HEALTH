import { NextResponse } from "next/server";
import { openRouterConfigured, visionAnalyze } from "@/lib/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, 8);
  if (!files.length) return NextResponse.json({ error: "files required" }, { status: 400 });

  const extracted: { name: string; type: string; preview: string }[] = [];
  const images: string[] = [];

  for (const file of files) {
    const type = file.type || "application/octet-stream";
    const buf = Buffer.from(await file.arrayBuffer());
    if (type.startsWith("image/")) {
      images.push(`data:${type};base64,${buf.toString("base64")}`);
      extracted.push({ name: file.name, type, preview: `image ${Math.round(buf.length / 1024)} KB` });
    } else if (type.startsWith("text/") || file.name.endsWith(".csv") || file.name.endsWith(".json") || file.name.endsWith(".md")) {
      const text = buf.toString("utf8").slice(0, 12000);
      extracted.push({ name: file.name, type, preview: text });
    } else {
      extracted.push({
        name: file.name,
        type,
        preview: `Binary ${Math.round(buf.length / 1024)} KB. ${type.includes("pdf") ? "Send page screenshots or use Vision Lab for scanned PDFs." : "Unsupported as text."}`,
      });
    }
  }

  let analysis = "";
  let model = "local-ingest";
  if (openRouterConfigured() && (images.length || extracted.some((e) => e.preview.length > 40))) {
    try {
      const prompt = `Ingest these Ghana Health Service files. Extract any weekly counts, dates, regions, diseases. Flag identifiers. Summarize fitness for the forecasting engine.\n\nTEXT EXTRACTS:\n${extracted.map((e) => `## ${e.name}\n${e.preview.slice(0, 4000)}`).join("\n\n")}`;
      const r = await visionAnalyze({
        prompt,
        images: images.slice(0, 4),
        extraSystem: "You are ingesting surveillance artefacts for Ghana only. Structured extraction, no diagnosis.",
      });
      analysis = r.text;
      model = r.model;
    } catch (err) {
      analysis = (err as Error).message;
    }
  } else if (!openRouterConfigured()) {
    analysis = "Files accepted locally. Connect OPENROUTER_API_KEY to run vision + document intelligence.";
  }

  return NextResponse.json({ files: extracted.map(({ name, type }) => ({ name, type })), analysis, model });
}
