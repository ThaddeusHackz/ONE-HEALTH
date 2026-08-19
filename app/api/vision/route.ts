import { NextResponse } from "next/server";
import { analyzeUploads } from "@/lib/analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  const files: File[] = [];
  let kind = "document";
  let prompt = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    kind = String(form.get("kind") || "document");
    prompt = String(form.get("prompt") || "");
    for (const value of form.getAll("files")) {
      if (value instanceof File) files.push(value);
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as {
      images?: string[];
      prompt?: string;
      kind?: string;
    };
    kind = body.kind || "document";
    prompt = body.prompt || "";
    for (const [i, data] of (body.images || []).entries()) {
      if (!data?.startsWith("data:")) continue;
      const [meta, b64] = data.split(",");
      const mime = meta.slice(5, meta.indexOf(";")) || "image/jpeg";
      const buf = Buffer.from(b64 || "", "base64");
      files.push(new File([buf], `image-${i + 1}.png`, { type: mime }));
    }
  }

  if (!files.length) {
    return NextResponse.json({ error: "Attach at least one file — image, PDF, Word, Excel, CSV, or text." }, { status: 400 });
  }

  try {
    const result = await analyzeUploads({ files, prompt, kind });
    return NextResponse.json({
      text: result.analysis,
      model: result.model,
      redactions: result.redactions,
      files: result.extracted.map((e) => ({ name: e.name, type: e.type, kind: e.kind, size: e.size, chars: e.text.length })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
