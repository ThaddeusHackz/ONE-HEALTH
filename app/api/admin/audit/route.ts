import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/body";
import { requireAdmin } from "@/lib/auth";
import { getDB } from "@/lib/store";
import { signPayload, verifyPayload } from "@/lib/sign";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDB();
  const body = {
    service: "ONE HEALTH GHANA",
    exportedAt: new Date().toISOString(),
    audits: db.audits,
    activity: db.activity.slice(0, 200),
    documents: db.documents.map((d) => ({ id: d.id, name: d.name, kind: d.kind, model: d.model, createdAt: d.createdAt })),
    chats: db.chats.map((c) => ({ id: c.id, title: c.title, model: c.model, turns: c.messages.length, createdAt: c.createdAt })),
    forecasts: db.forecasts.slice(0, 100),
    officialSeries: db.officialSeries.map((s) => ({
      id: s.id,
      diseaseId: s.diseaseId,
      regionId: s.regionId,
      weeks: s.points.length,
      source: s.source,
    })),
  };
  const signed = signPayload(body);
  return new NextResponse(JSON.stringify(signed, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="one-health-ghana-audit-${Date.now()}.json"`,
    },
  });
}

export async function POST(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const readPack = await readJsonBody(req, 2_000_000);
  if (!readPack.ok) return NextResponse.json({ error: readPack.error }, { status: readPack.status });
  const pack = readPack.data as { signature?: string; body?: unknown };
  return NextResponse.json(verifyPayload(pack));
}
