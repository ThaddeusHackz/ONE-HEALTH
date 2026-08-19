import { NextResponse } from "next/server";
import { analyzeUploads } from "@/lib/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "files required" }, { status: 400 });
  const result = await analyzeUploads({
    files,
    kind: String(form.get("kind") || "document"),
    prompt: String(form.get("prompt") || ""),
  });
  return NextResponse.json({
    analysis: result.analysis,
    model: result.model,
    files: result.extracted.map((e) => ({ name: e.name, type: e.type, kind: e.kind })),
  });
}
