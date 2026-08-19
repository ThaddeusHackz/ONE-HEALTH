import { NextResponse } from "next/server";
import { DHIMS2_TEMPLATE, parseDhims2 } from "@/lib/dhims2";
import { openRouterReview } from "@/lib/or-review";
import { findOfficialSeries, getDB, recordAudit, saveDB, uid } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("template") === "1") {
    return new NextResponse(DHIMS2_TEMPLATE, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=dhims2-template-ghana.csv",
      },
    });
  }
  const diseaseId = url.searchParams.get("disease") || "";
  const regionId = url.searchParams.get("region") || "";
  if (diseaseId && regionId) {
    return NextResponse.json({ series: findOfficialSeries(diseaseId, regionId, url.searchParams.get("district") || undefined) });
  }
  return NextResponse.json({
    series: getDB().officialSeries.map(({ points, ...rest }) => ({ ...rest, weeks: points.length })),
  });
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

  let points = body.points || [];
  let quality = null;
  if (!points.length && body.csv) {
    const parsed = parseDhims2(body.csv);
    points = parsed.points;
    quality = parsed.quality;
    if (!points.length) {
      return NextResponse.json({ error: quality.warnings[0] || "Could not parse extract", quality }, { status: 400 });
    }
  }

  if (!body.diseaseId || !body.regionId || points.length < 8) {
    return NextResponse.json(
      { error: "Need diseaseId, regionId and at least 8 weekly points.", quality },
      { status: 400 },
    );
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
    db.officialSeries = db.officialSeries.slice(0, 400);
  }, {
    type: "official.series",
    actor: "extracts",
    payload: { id: row.id, diseaseId: row.diseaseId, regionId: row.regionId, weeks: row.points.length, quality },
  });
  recordAudit({
    actor: "series",
    action: "official.upload",
    redactions: 0,
    detail: `${row.diseaseId}/${row.regionId} ${row.points.length} weeks completeness=${quality?.completeness ?? "n/a"}`,
  });
  const review = await openRouterReview("dhims2", {
    quality,
    weeks: row.points.length,
    diseaseId: row.diseaseId,
    regionId: row.regionId,
    last4: row.points.slice(-4),
  });
  return NextResponse.json({ ok: true, weeks: row.points.length, id: row.id, quality, review: review.text, reviewModel: review.model });
}
