import { NextResponse } from "next/server";
import { nationalSnapshot, runForecast } from "@/lib/forecast";
import { completeWithSystem, openRouterConfigured } from "@/lib/openrouter";
import { saveDB, uid } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("snapshot") === "1") {
    return NextResponse.json({ snapshot: nationalSnapshot() });
  }
  const diseaseId = url.searchParams.get("disease") || "malaria";
  const regionId = url.searchParams.get("region") || "national";
  const horizon = Number(url.searchParams.get("horizon") || 4);
  const bundle = runForecast({ diseaseId, regionId, horizon });
  return NextResponse.json(bundle);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    diseaseId?: string;
    regionId?: string;
    horizon?: number;
    brief?: boolean;
  };
  const bundle = runForecast({
    diseaseId: body.diseaseId || "malaria",
    regionId: body.regionId || "national",
    horizon: body.horizon || 4,
  });

  let briefing = "";
  let model = "local-ensemble";
  if (body.brief && openRouterConfigured()) {
    try {
      const r = await completeWithSystem({
        extraSystem:
          "Write a 180-word Ghana Health Service briefing. Use only the numbers provided. State uncertainty. End with 3 investigation actions.",
        user: JSON.stringify({
          disease: bundle.disease.name,
          region: bundle.region.name,
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

  return NextResponse.json({ ...bundle, briefing, briefingModel: model });
}
