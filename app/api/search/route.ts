import { NextResponse } from "next/server";
import { webSearch } from "@/lib/search";
import { completeWithSystem, openRouterConfigured } from "@/lib/openrouter";
import { readJsonBody } from "@/lib/body";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const read = await readJsonBody(req, 32_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as { query?: string; synthesize?: boolean };
  const query = (body.query || "").trim();
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });
  const hits = await webSearch(query, 6);
  let synthesis = "";
  let model = "search-only";
  if (body.synthesize && openRouterConfigured() && hits.length) {
    try {
      const r = await completeWithSystem({
        extraSystem: "Synthesize only from the provided hits. Ghana-only public health. Cite URLs. Flag stale or unofficial pages.",
        user: `Query: ${query}\n\nHits:\n${JSON.stringify(hits, null, 2)}`,
        temperature: 0.2,
      });
      synthesis = r.text;
      model = r.model;
    } catch (err) {
      synthesis = (err as Error).message;
    }
  }
  return NextResponse.json({ hits, synthesis, model });
}
