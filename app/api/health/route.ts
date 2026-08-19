import { NextResponse } from "next/server";
import { elevenLabsKey, openRouterKey, openWeatherKey, tavilyKey } from "@/lib/env";
import { getDB } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  const db = getDB();
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
      search: Boolean(tavilyKey()),
      voice: Boolean(elevenLabsKey()),
      weather: Boolean(openWeatherKey()),
    },
    store: {
      documents: db.documents.length,
      chats: db.chats.length,
      forecasts: db.forecasts.length,
      officialSeries: db.officialSeries.length,
      audits: db.audits.length,
    },
  });
}
