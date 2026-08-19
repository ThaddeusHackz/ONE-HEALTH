import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { archiveStats, readArchiveRaw, readRecentEvents } from "@/lib/archive";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("download") === "1") {
    return new NextResponse(readArchiveRaw(), {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="one-health-ghana-events-${Date.now()}.jsonl"`,
      },
    });
  }
  return NextResponse.json({ stats: archiveStats(), recent: readRecentEvents(80) });
}
