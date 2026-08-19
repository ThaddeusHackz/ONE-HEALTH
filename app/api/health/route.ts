import { NextResponse } from "next/server";
import { elevenLabsKey, openRouterKey, openWeatherKey, tavilyKey } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "ONE HEALTH GHANA",
    time: new Date().toISOString(),
    capabilities: {
      openrouter: Boolean(openRouterKey()),
      search: Boolean(tavilyKey()),
      voice: Boolean(elevenLabsKey()),
      weather: Boolean(openWeatherKey()),
    },
  });
}
