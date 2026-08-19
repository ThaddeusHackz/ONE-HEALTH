import { NextResponse } from "next/server";
import { runForecast } from "@/lib/forecast";
import { reportingNowcast } from "@/lib/nowcast";
import { openRouterReview } from "@/lib/or-review";
import { findOfficialSeries } from "@/lib/store";
import { districtById } from "@/lib/districts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const diseaseId = url.searchParams.get("disease") || "malaria";
  const regionId = url.searchParams.get("region") || "national";
  const districtId = url.searchParams.get("district") || undefined;
  const official = findOfficialSeries(diseaseId, regionId, districtId);
  const district = districtById(districtId);
  const bundle = runForecast({
    diseaseId,
    regionId,
    districtScale: district?.scale,
    official: official?.points,
  });
  const nowcast = reportingNowcast(bundle.series.map((s) => ({ date: s.date, cases: s.cases })));
  const review = url.searchParams.get("ai") === "0"
    ? { text: "", model: "skipped" }
    : await openRouterReview("nowcast", {
      disease: bundle.disease.name,
      region: bundle.region.name,
      source: bundle.diagnostics.source,
      current: nowcast.current,
    });
  return NextResponse.json({
    disease: bundle.disease.name,
    region: bundle.region.name,
    source: bundle.diagnostics.source,
    nowcast,
    review: review.text,
    reviewModel: review.model,
  });
}
