import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/body";
import { deleteFile, listFiles, readFile, writeFile } from "@/lib/agent/memory";
import { deleteUpload, listUploads, readUploadHead } from "@/lib/agent/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");

  if (name) {
    // Small DB-backed file first, then a large disk-backed upload.
    const file = readFile(name);
    if (file) return NextResponse.json({ file });
    const head = await readUploadHead(name).catch(() => null);
    if (head) {
      return NextResponse.json({
        file: {
          name: head.name,
          language: "text",
          content: head.text,
          bytes: head.bytes,
          truncated: head.truncated,
          kind: "upload",
          updatedAt: new Date().toISOString(),
        },
      });
    }
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const [small, uploads] = await Promise.all([Promise.resolve(listFiles()), listUploads().catch(() => [])]);
  return NextResponse.json({ files: [...small, ...uploads] });
}

export async function POST(req: Request) {
  const read = await readJsonBody(req, 4_000_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as {
    name?: string;
    content?: string;
    language?: string;
    delete?: string;
  };
  if (body.delete) {
    deleteFile(body.delete);
    await deleteUpload(body.delete).catch(() => undefined);
    return NextResponse.json({ ok: true });
  }
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const file = writeFile(body.name, body.content || "", body.language);
  return NextResponse.json({ file });
}
