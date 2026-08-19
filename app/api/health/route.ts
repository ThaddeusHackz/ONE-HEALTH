import { NextResponse } from "next/server";
import { elevenLabsKey, maskKey, openRouterKey, openWeatherKey, tavilyKey } from "@/lib/env";
import { archiveStats } from "@/lib/archive";
import { lastOpenRouterError } from "@/lib/openrouter";
import { getDB } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  let store = {
    documents: 0,
    chats: 0,
    forecasts: 0,
    officialSeries: 0,
    audits: 0,
  };
  try {
    const db = getDB();
    store = {
      documents: db.documents.length,
      chats: db.chats.length,
      forecasts: db.forecasts.length,
      officialSeries: db.officialSeries.length,
      audits: db.audits.length,
    };
  } catch (err) {
    console.error("[health] store read skipped", (err as Error).message);
  }
  return NextResponse.json({
    ok: true,
    service: "ONE HEALTH GHANA",
    time: new Date().toISOString(),
    host: {
      node: process.version,
      env: process.env.NODE_ENV || "development",
    },
    capabilities: {
      openrouter: Boolean(openRouterKey()),
      openrouterKey: maskKey(openRouterKey()),
      lastOpenRouterError: lastOpenRouterError() || null,
      search: Boolean(tavilyKey()),
      voice: Boolean(elevenLabsKey()),
      weather: Boolean(openWeatherKey()),
      freeModelFallback: true,
      openrouterMaxModelsPerRequest: 3,
    },
    store,
    archive: archiveStats(),
    postgres: Boolean((process.env.DATABASE_URL || "").trim()),
  });
}
