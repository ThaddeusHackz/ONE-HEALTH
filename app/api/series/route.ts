import { NextResponse } from "next/server";
import { findOfficialSeries, getDB, recordAudit, saveDB, uid } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const diseaseId = url.searchParams.get("disease") || "";
  const regionId = url.searchParams.get("region") || "";
  if (diseaseId && regionId) {
    return NextResponse.json({ series: findOfficialSeries(diseaseId, regionId, url.searchParams.get("district") || undefined) });
  }
  return NextResponse.json({ series: getDB().officialSeries.map(({ points, ...rest }) => ({ ...rest, weeks: points.length })) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    diseaseId?: string;
    regionId?: string;
    districtId?: string;
    source?: string;
    points?: { date: string; cases: number }[];
    csv?: string;
  };
  const points = body.points?.length ? body.points : parseCsv(body.csv || "");
  if (!body.diseaseId || !body.regionId || points.length < 8) {
    return NextResponse.json({ error: "Need diseaseId, regionId and at least 8 weekly points (date,cases)." }, { status: 400 });
  }
  const row = {
    id: uid("ser"),
    diseaseId: body.diseaseId,
    regionId: body.regionId,
    districtId: body.districtId,
    source: body.source || "DHIMS2/IDSR upload",
    points: points.map((p) => ({ date: p.date, cases: Number(p.cases) || 0 })),
    createdAt: new Date().toISOString(),
  };
  saveDB((db) => {
    db.officialSeries = db.officialSeries.filter(
      (s) => !(s.diseaseId === row.diseaseId && s.regionId === row.regionId && s.districtId === row.districtId),
    );
    db.officialSeries.unshift(row);
    db.officialSeries = db.officialSeries.slice(0, 80);
  });
  recordAudit({ actor: "series", action: "official.upload", redactions: 0, detail: `${row.diseaseId}/${row.regionId} ${row.points.length} weeks` });
  return NextResponse.json({ ok: true, weeks: row.points.length, id: row.id });
}

function parseCsv(csv: string) {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(/[,;\t]/).map((h) => h.trim());
  const di = header.findIndex((h) => h.includes("date") || h.includes("week"));
  const ci = header.findIndex((h) => h.includes("case") || h.includes("count") || h === "value");
  if (di < 0 || ci < 0) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(/[,;\t]/);
    return { date: cols[di]?.trim() || "", cases: Number(cols[ci]) || 0 };
  }).filter((p) => p.date);
}
