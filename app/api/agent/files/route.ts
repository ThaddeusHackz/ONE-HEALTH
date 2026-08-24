import { NextResponse } from "next/server";
import { deleteFile, listFiles, readFile, writeFile } from "@/lib/agent/memory";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (name) {
    const file = readFile(name);
    return file
      ? NextResponse.json({ file })
      : NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  return NextResponse.json({ files: listFiles() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    content?: string;
    language?: string;
    delete?: string;
  };
  if (body.delete) {
    deleteFile(body.delete);
    return NextResponse.json({ ok: true });
  }
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const file = writeFile(body.name, body.content || "", body.language);
  return NextResponse.json({ file });
}
