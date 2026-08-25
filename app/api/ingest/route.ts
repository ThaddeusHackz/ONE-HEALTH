import { NextResponse } from "next/server";
import { analyzeUploads } from "@/lib/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Same inline caps as /api/vision - a 512 MB instance must never buffer a huge upload whole. */
const MAX_FILES = 8;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "files required" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files (${files.length}) - at most ${MAX_FILES} per ingest.` }, { status: 413 });
  }
  const oversized = files.filter((f) => f.size > MAX_FILE_BYTES);
  if (oversized.length) {
    return NextResponse.json(
      { error: `${oversized.map((f) => f.name).join(", ")} exceeded ${MAX_FILE_BYTES / 1024 / 1024} MB. Use the AI Agent workspace upload for files up to 2 GB.` },
      { status: 413 },
    );
  }
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
