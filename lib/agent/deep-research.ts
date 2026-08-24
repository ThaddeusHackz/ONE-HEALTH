import { complete, openRouterConfigured, type ChatMessage } from "@/lib/openrouter";
import { agentWebSearch, fetchPageText, type AgentSearchHit } from "./web";
import type { Citation } from "./types";

export interface DeepResearchReport {
  question: string;
  queries: string[];
  citations: Citation[];
  markdown: string;
  sourcesRead: number;
}

const MAX_SUBQUERIES = 4;
const MAX_READ = 4;

/**
 * Deep Research: decompose → parallel live search → read the best pages →
 * synthesise one sourced brief. Mirrors the ChatGPT/Claude/Copilot research
 * modes but stays on the OpenRouter key with the platform's fallback chain.
 */
export async function deepResearch(opts: { question: string; focus: string }): Promise<DeepResearchReport> {
  const question = opts.question.trim();
  const queries = openRouterConfigured() ? await decompose(question, opts.focus) : defaultQueries(question);
  const limited = queries.slice(0, MAX_SUBQUERIES);

  const searches = await Promise.all(
    limited.map((q) =>
      agentWebSearch({ query: q, maxResults: 5, topic: /news|outbreak|latest|today/i.test(q) ? "news" : "general", includeImages: false }),
    ),
  );

  const seen = new Set<string>();
  const hits: (AgentSearchHit & { query: string })[] = [];
  searches.forEach((s, i) => {
    for (const h of s.hits) {
      if (!h.url || seen.has(h.url)) continue;
      seen.add(h.url);
      hits.push({ ...h, query: limited[i] });
    }
  });

  // Read the strongest few sources so the brief is grounded, not just titles.
  const toRead = hits.slice(0, MAX_READ);
  const pages = await Promise.all(toRead.map((h) => fetchPageText(h.url, 4500)));

  const sourcesBlock = hits
    .slice(0, 14)
    .map((h, i) => {
      const page = pages.find((p) => p.url === h.url);
      return `${i + 1}. ${h.title}\n   URL: ${h.url}\n   Query: ${h.query}\n   Snippet: ${h.snippet}${
        page?.text ? `\n   Excerpt: ${page.text.slice(0, 1200)}` : ""
      }`;
    })
    .join("\n\n");

  const answers = searches.map((s) => s.answer).filter(Boolean).join("\n");

  if (!openRouterConfigured()) {
    return {
      question,
      queries: limited,
      citations: hits.slice(0, 10).map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })),
      markdown: `## Deep research (offline model layer)\n\n**Question:** ${question}\n\nLive sources were retrieved but no model key is configured to synthesise them.\n\n${hits
        .slice(0, 8)
        .map((h, i) => `${i + 1}. [${h.title}](${h.url})\n   ${h.snippet}`)
        .join("\n\n")}`,
      sourcesRead: pages.length,
    };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are the Deep Research engine of ONE HEALTH GHANA.
Write a structured, decision-useful brief from the supplied live sources only.
Rules:
- Markdown: a 2-3 sentence answer up front, then sections with ## headings, then "Open questions" and "Sources".
- Cite inline as [n](url) using the numbering given. Never invent a source, statistic or URL.
- Where sources disagree, say so and show both.
- Flag anything that is model knowledge rather than a cited source.
- For health topics keep the Ghana One Health frame: human / animal / environment, and the interval-not-certainty discipline.
- 350-800 words.`,
    },
    {
      role: "user",
      content: `QUESTION: ${question}${opts.focus ? `\nFOCUS: ${opts.focus}` : ""}\n\nSUB-QUERIES RUN:\n${limited
        .map((q, i) => `${i + 1}. ${q}`)
        .join("\n")}\n\n${answers ? `SEARCH ANSWERS:\n${answers}\n\n` : ""}SOURCES:\n${sourcesBlock || "No sources retrieved."}`,
    },
  ];

  const result = await complete({ messages, temperature: 0.25, maxTokens: 2200 });

  return {
    question,
    queries: limited,
    citations: hits.slice(0, 12).map((h) => ({ title: h.title, url: h.url, snippet: h.snippet })),
    markdown: result.text,
    sourcesRead: pages.length,
  };
}

async function decompose(question: string, focus: string): Promise<string[]> {
  try {
    const result = await complete({
      json: true,
      temperature: 0.2,
      maxTokens: 400,
      messages: [
        {
          role: "system" as const,
          content:
            'Break a research question into 3-4 distinct, search-engine-ready sub-queries. Cover different angles (definition/current state, data or evidence, Ghana or local context when relevant, risks or counter-evidence). Return strict JSON: {"queries":["..."]}',
        },
        { role: "user" as const, content: `${question}${focus ? `\nFocus: ${focus}` : ""}` },
      ] satisfies ChatMessage[],
    });
    const parsed = JSON.parse(extractJson(result.text)) as { queries?: string[] };
    const queries = (parsed.queries || []).map((q) => String(q).trim()).filter(Boolean);
    return queries.length ? queries : defaultQueries(question);
  } catch {
    return defaultQueries(question);
  }
}

function defaultQueries(question: string): string[] {
  const base = question.replace(/\?$/, "");
  return [
    base,
    `${base} latest data statistics`,
    `${base} Ghana Africa health`,
    `${base} risks criticism limitations`,
  ];
}

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : "{}";
}
