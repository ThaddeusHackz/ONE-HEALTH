import { NextResponse } from "next/server";
import { completeWithSystem, geminiConfigured } from "@/lib/llm";
import { formatHits, webSearch } from "@/lib/search";
import { ghanaWeather } from "@/lib/weather";
import { nationalSnapshot } from "@/lib/forecast";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const [weather, hits] = await Promise.all([ghanaWeather(), webSearch("Ghana Health Service outbreak OR malaria OR cholera", 5)]);
  const snap = nationalSnapshot();
  const alerts = snap.filter((s) => s.alert);

  if (!geminiConfigured()) {
    return NextResponse.json({
      model: "offline",
      text: `Offline sitrep. ${alerts.length} signals above z=2. Weather: ${weather.note}. Search hits: ${hits.length}.`,
      weather,
      hits,
      snapshot: snap,
    });
  }

  try {
    const r = await completeWithSystem({
      extraSystem:
        "Write a 220-word Ghana Health Service morning sitrep. Use only provided numbers and hits. Cite URLs. State uncertainty. End with 4 investigation actions. Never invent official circulars.",
      user: JSON.stringify({
        alerts,
        snapshot: snap.slice(0, 8),
        weather: weather.rows.slice(0, 6),
        weatherNote: weather.note,
        hits,
      }),
      temperature: 0.25,
    });
    return NextResponse.json({ model: r.model, text: r.text, weather, hits, snapshot: snap });
  } catch (err) {
    return NextResponse.json({
      model: "error",
      text: (err as Error).message,
      weather,
      hits: hits,
      snapshot: snap,
      searchText: formatHits(hits),
    });
  }
}
