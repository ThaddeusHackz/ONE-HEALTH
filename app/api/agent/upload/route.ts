import { NextResponse } from "next/server";
import {
  abortUpload,
  appendChunk,
  completeUpload,
  deleteUpload,
  initUpload,
  MAX_UPLOAD_BYTES,
  pruneStaleUploads,
} from "@/lib/agent/uploads";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Chunked large-file upload endpoint (up to 2 GB per file).
 *
 *   POST /api/agent/upload            JSON { action: "init", name, size, mime }
 *   PUT  /api/agent/upload?id=<uuid>  raw binary chunk body (≈6 MB, sequential)
 *   POST /api/agent/upload            JSON { action: "complete", uploadId }
 *   POST /api/agent/upload            JSON { action: "abort", uploadId }
 *
 * Sequential 6 MB chunks keep a 512 MB Render instance comfortable while the
 * client shows live progress; nothing but the registry JSON is ever fully in
 * memory on the server.
 */

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Send JSON for control actions; use PUT for chunk bodies." }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    size?: number;
    mime?: string;
    uploadId?: string;
  };

  try {
    switch (body.action) {
      case "init": {
        if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
        const started = await initUpload({
          name: String(body.name),
          size: Number(body.size) || 0,
          mime: body.mime ? String(body.mime) : undefined,
        });
        return NextResponse.json({ ok: true, ...started });
      }
      case "complete": {
        if (!body.uploadId) return NextResponse.json({ error: "uploadId required" }, { status: 400 });
        const { entry } = await completeUpload(String(body.uploadId));
        return NextResponse.json({
          ok: true,
          file: {
            name: entry.name,
            bytes: entry.bytes,
            mime: entry.mime,
            updatedAt: entry.updatedAt,
            kind: "upload",
          },
        });
      }
      case "abort": {
        if (body.uploadId) await abortUpload(String(body.uploadId));
        return NextResponse.json({ ok: true });
      }
      case "prune": {
        await pruneStaleUploads();
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const uploadId = url.searchParams.get("id") || "";
  if (!uploadId) return NextResponse.json({ error: "upload id query param required" }, { status: 400 });

  const buf = Buffer.from(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (!buf.length) return NextResponse.json({ error: "empty chunk" }, { status: 400 });
  if (buf.length > 16 * 1024 * 1024) {
    return NextResponse.json({ error: "chunk too large - send ≤ 16 MB per PUT" }, { status: 413 });
  }
  try {
    const { received } = await appendChunk(uploadId, buf);
    return NextResponse.json({ ok: true, received, maxBytes: MAX_UPLOAD_BYTES });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    maxBytes: MAX_UPLOAD_BYTES,
    hint: "POST {action:'init'} → PUT binary chunks ?id=… → POST {action:'complete'}",
  });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const removed = await deleteUpload(name);
  return NextResponse.json({ ok: removed });
}
