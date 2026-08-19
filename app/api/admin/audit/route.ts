import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDB } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDB();
  const pack = {
    exportedAt: new Date().toISOString(),
    audits: db.audits,
    activity: db.activity.slice(0, 200),
    documents: db.documents.map((d) => ({ id: d.id, name: d.name, kind: d.kind, model: d.model, createdAt: d.createdAt })),
    chats: db.chats.map((c) => ({ id: c.id, title: c.title, model: c.model, turns: c.messages.length, createdAt: c.createdAt })),
    forecasts: db.forecasts.slice(0, 100),
    officialSeries: db.officialSeries.map((s) => ({ id: s.id, diseaseId: s.diseaseId, regionId: s.regionId, weeks: s.points.length, source: s.source })),
  };
  return new NextResponse(JSON.stringify(pack, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="one-health-ghana-audit-${Date.now()}.json"`,
    },
  });
}
