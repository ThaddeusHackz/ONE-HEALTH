import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { uploadPathFor } from "@/lib/agent/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream a large workspace upload back to the browser.
 * GET /api/agent/download?name=<original file name>
 *
 * Streams from disk (never buffers a 2 GB file in RAM) with Range support so
 * video/audio/large CSVs open directly in the browser or a download manager.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const path = await uploadPathFor(name);
  if (!path) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const info = await stat(path);
  const range = req.headers.get("range");
  const safeDisplay = name.replace(/["\\\r\n]/g, "_");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
      if (Number.isFinite(start) && start <= end && start < info.size) {
        const stream = createReadStream(path, { start, end });
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${info.size}`,
            "Accept-Ranges": "bytes",
            "Content-Disposition": `attachment; filename="${safeDisplay}"`,
          },
        });
      }
    }
  }

  const stream = createReadStream(path);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(info.size),
      "Accept-Ranges": "bytes",
      "Content-Disposition": `attachment; filename="${safeDisplay}"`,
    },
  });
}
