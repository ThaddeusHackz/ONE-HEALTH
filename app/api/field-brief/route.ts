import { NextResponse } from "next/server";
import { completeWithSystem, openRouterConfigured } from "@/lib/openrouter";
import { runForecast } from "@/lib/forecast";
import { reportingNowcast } from "@/lib/nowcast";
import { languageInstruction } from "@/lib/languages";
import { findOfficialSeries, recordAudit } from "@/lib/store";
import { districtById } from "@/lib/districts";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const FALLBACK: Record<string, string> = {
  en: "Field brief (offline). Check this week's line list, water points if enteric, and report missing weeks to the district. This is not outbreak confirmation.",
  tw: "Afie nsɛm (offline). Hwɛ nnawɔtwe yi line list, nsuo si water point sɛ ɛyɛ yare a ɛfa nsuo ho, na bɔ district amanneɛ wɔ nnawɔtwe a ɛyera. Eyi nnyɛ outbreak confirmation.",
  ee: "Dɔwɔƒe nyatakaka (offline). Kpɔ kɔsiɖa sia ƒe line list, tsi nɔƒewo ne dɔléle la ku ɖe tsi ŋu, eye nàgblɔ kɔsiɖa siwo bu la na district. Esia menye outbreak kpeɖodzi o.",
  gaa: "Shia sane (offline). Kwɛ this week line list, nu he jeɔ enteric, ke ke district missing weeks. Lɛ ji outbreak confirmation.",
  ha: "Takaitaccen labari (offline). Duba jerin wannan mako, wuraren ruwa idan cutar ta shafi ruwa, kuma kai rahoton makonni da suka ɓace ga gunduma. Wannan ba tabbacin barkewar cuta ba ne.",
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    diseaseId?: string;
    regionId?: string;
    districtId?: string;
    language?: string;
  };
  const diseaseId = body.diseaseId || "malaria";
  const regionId = body.regionId || "national";
  const language = body.language || "en";
  const official = findOfficialSeries(diseaseId, regionId, body.districtId);
  const district = districtById(body.districtId);
  const bundle = runForecast({
    diseaseId,
    regionId,
    districtScale: district?.scale,
    official: official?.points,
  });
  const nowcast = reportingNowcast(bundle.series.map((s) => ({ date: s.date, cases: s.cases })));

  const payload = {
    disease: bundle.disease.name,
    region: bundle.region.name,
    district: district?.name || null,
    nowcast: nowcast.current,
    latest: bundle.diagnostics.latest,
    z: bundle.diagnostics.latestZ,
    next: bundle.ensemble.points[0],
    source: bundle.diagnostics.source,
  };

  let text = FALLBACK[language] || FALLBACK.en;
  let model = "offline-field-card";
  if (openRouterConfigured()) {
    try {
      const r = await completeWithSystem({
        extraSystem: `Write a 90-word FIELD card for a Ghana CHPS / district officer. No jargon wall. 3 numbered actions. State that this is not confirmation. ${languageInstruction(language)}`,
        user: JSON.stringify(payload),
        temperature: 0.25,
      });
      text = r.text;
      model = r.model;
    } catch (err) {
      text = `${FALLBACK[language] || FALLBACK.en} (${(err as Error).message})`;
    }
  }

  recordAudit({
    actor: "field",
    action: "field.brief",
    model,
    redactions: 0,
    detail: `${diseaseId}/${regionId}/${language}`,
  });

  return NextResponse.json({ text, model, speakable: text.replace(/[#*_`]/g, "").slice(0, 1800), payload, nowcast });
}
