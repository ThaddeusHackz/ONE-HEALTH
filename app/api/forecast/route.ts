import { NextResponse } from "next/server";
import { nationalSnapshot, runForecast } from "@/lib/forecast";
import { completeWithSystem, openRouterConfigured } from "@/lib/openrouter";
import { districtById } from "@/lib/districts";
import { findOfficialSeries, recordAudit, saveDB, uid } from "@/lib/store";
import { languageInstruction } from "@/lib/languages";
import { reportingNowcast } from "@/lib/nowcast";

export const dynamic = "force-dynamic";

function bundleFor(opts: { diseaseId: string; regionId: string; horizon?: number; districtId?: string }) {
  const official = findOfficialSeries(opts.diseaseId, opts.regionId, opts.districtId);
  const district = districtById(opts.districtId);
  return runForecast({
    diseaseId: opts.diseaseId,
    regionId: opts.regionId,
    horizon: opts.horizon || 4,
    districtScale: district?.scale,
    official: official?.points,
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("snapshot") === "1") {
    return NextResponse.json({ snapshot: nationalSnapshot() });
  }
  const bundle = bundleFor({
    diseaseId: url.searchParams.get("disease") || "malaria",
    regionId: url.searchParams.get("region") || "national",
    horizon: Number(url.searchParams.get("horizon") || 4),
    districtId: url.searchParams.get("district") || undefined,
  });
  return NextResponse.json(bundle);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    diseaseId?: string;
    regionId?: string;
    districtId?: string;
    horizon?: number;
    brief?: boolean;
    language?: string;
  };
  const bundle = bundleFor({
    diseaseId: body.diseaseId || "malaria",
    regionId: body.regionId || "national",
    horizon: body.horizon || 4,
    districtId: body.districtId,
  });

  let briefing = "";
  let model = "local-ensemble";
  if (body.brief && openRouterConfigured()) {
    try {
      const r = await completeWithSystem({
        extraSystem: `Write a 180-word Ghana Health Service briefing. Use only the numbers provided. State uncertainty. End with 3 investigation actions. ${languageInstruction(body.language)}`,
        user: JSON.stringify({
          disease: bundle.disease.name,
          region: bundle.region.name,
          district: body.districtId || null,
          narrative: bundle.narrative,
          diagnostics: bundle.diagnostics,
          ensemble: bundle.ensemble.points,
          recentAlerts: bundle.alerts.slice(-4),
          disclaimer: bundle.disclaimer,
        }),
        temperature: 0.25,
      });
      briefing = r.text;
      model = r.model;
    } catch (err) {
      briefing = `${bundle.narrative.nowcast} ${bundle.narrative.outlook} ${bundle.narrative.limits}`;
      model = `local-fallback: ${(err as Error).message}`;
    }
  }

  saveDB((db) => {
    db.forecasts.unshift({
      id: uid("fc"),
      diseaseId: bundle.disease.id,
      regionId: bundle.region.id,
      latest: bundle.diagnostics.latest,
      nextWeek: bundle.ensemble.points[0]?.point || 0,
      z: bundle.diagnostics.latestZ,
      summary: briefing || bundle.narrative.nowcast,
      createdAt: new Date().toISOString(),
    });
    db.forecasts = db.forecasts.slice(0, 200);
  });
  recordAudit({
    actor: "forecast",
    action: "forecast.run",
    model,
    redactions: 0,
    detail: `${bundle.disease.id}/${bundle.region.id} source=${bundle.diagnostics.source}`,
  });

  const nowcast = reportingNowcast(bundle.series.map((s) => ({ date: s.date, cases: s.cases })));
  return NextResponse.json({ ...bundle, briefing, briefingModel: model, districtId: body.districtId || null, nowcast });
}
