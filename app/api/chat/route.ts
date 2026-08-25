import { NextResponse } from "next/server";
import { complete, openRouterConfigured, type ChatMessage } from "@/lib/openrouter";
import { formatHits, webSearch } from "@/lib/search";
import { GHANA_CONTEXT } from "@/lib/ghana";
import { runForecast } from "@/lib/forecast";
import { languageInstruction } from "@/lib/languages";
import { redactMessages, redactText } from "@/lib/redact";
import { recordAudit, saveDB, uid } from "@/lib/store";
import { readJsonBody } from "@/lib/body";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const read = await readJsonBody(req, 8_000_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as {
    messages?: { role: "user" | "assistant"; content: string }[];
    search?: boolean;
    diseaseId?: string;
    regionId?: string;
    language?: string;
  };

  const history = redactMessages((body.messages || []).slice(-16));
  const last = [...history].reverse().find((m) => m.role === "user")?.content || "";
  const redactions = (body.messages || []).reduce((n, m) => n + redactText(m.content).count, 0);

  if (!openRouterConfigured()) {
    const text = offlineAnswer(last);
    persistChat([...history, { role: "assistant", content: text }], "offline-ghana-knowledge", redactions);
    return NextResponse.json({
      text,
      model: "offline-ghana-knowledge",
      citations: [],
      redactions,
    });
  }

  let searchBlock = "";
  let citations: { title: string; url: string }[] = [];
  if (body.search && last) {
    const hits = await webSearch(last, 5);
    searchBlock = `\n\nLive web findings (verify before acting):\n${formatHits(hits)}`;
    citations = hits.map((h) => ({ title: h.title, url: h.url }));
  }

  let forecastBlock = "";
  if (body.diseaseId) {
    const f = runForecast({
      diseaseId: body.diseaseId,
      regionId: body.regionId || "national",
      horizon: 4,
    });
    forecastBlock = `\n\nCurrent local ensemble for ${f.disease.name} / ${f.region.name}:\n${JSON.stringify(
      {
        narrative: f.narrative,
        ensemble: f.ensemble.points,
        latestZ: f.diagnostics.latestZ,
        disclaimer: f.disclaimer,
      },
      null,
      2,
    )}`;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${GHANA_CONTEXT}

You may use live web findings if provided. Cite URLs inline.
If a local ensemble forecast is provided, treat it as a model output with intervals, not ground truth.
${languageInstruction(body.language)}
${searchBlock}${forecastBlock}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  try {
    const result = await complete({ messages, temperature: 0.35, maxTokens: 1800 });
    persistChat([...history, { role: "assistant", content: result.text }], result.model, redactions);
    return NextResponse.json({ text: result.text, model: result.model, citations, redactions });
  } catch (err) {
    const reason = (err as Error).message;
    const text = `${offlineAnswer(last)}\n\n_Live model note:_ ${reason}`;
    persistChat([...history, { role: "assistant", content: text }], "offline-ghana-knowledge", redactions);
    return NextResponse.json(
      { error: reason, text, model: "offline-ghana-knowledge", redactions },
      { status: 200 },
    );
  }
}

function persistChat(messages: { role: string; content: string }[], model: string, redactions = 0) {
  recordAudit({ actor: "intelligence", action: "chat", model, redactions, detail: messages.find((m) => m.role === "user")?.content.slice(0, 80) || "chat" });
  const title = messages.find((m) => m.role === "user")?.content.slice(0, 80) || "Conversation";
  saveDB((db) => {
    db.chats.unshift({ id: uid("chat"), title, messages, model, createdAt: new Date().toISOString() });
    db.chats = db.chats.slice(0, 200);
  });
}

function offlineAnswer(q: string): string {
  const s = q.toLowerCase();
  if (s.includes("malaria")) {
    return `**Malaria - Ghana (offline briefing)**

Malaria remains Ghana’s highest-burden notifiable disease. Transmission typically rises in the major rains (May-October), with heavy loads in savannah and forest regions.

**What the system can do once keys are connected:** ingest DHIMS2 weekly confirmed cases, run leakage-safe 4-week forecasts with intervals, and flag z-score departures for district investigation.

**What it cannot do:** declare an outbreak, or produce an error-free future count. A forecast is a probability statement.

Add \`OPENROUTER_API_KEY\` on the server to unlock live multi-model reasoning.`;
  }
  if (s.includes("cholera")) {
    return `**Cholera - Ghana (offline briefing)**

Watch Greater Accra, Central, Western and flood-prone Volta settlements in the rains. Pair human IDSR signals with NADMO flood reports and water-quality notes - that is One Health, not a single line list.

An alert (z > 2) is a prompt to check reporting backlogs, water points, and stool-culture capacity. It is not confirmation.`;
  }
  return `**ONE HEALTH GHANA - offline mode**

Live multi-model intelligence needs a server-side \`OPENROUTER_API_KEY\`. Statistical forecasts, outbreak z-scores, and the Ghana knowledge layer still run locally.

Ask about malaria, cholera, CSM, measles, yellow fever, mpox, Lassa, avian influenza, or a specific region. Do not paste patient names or identifiers.`;
}
