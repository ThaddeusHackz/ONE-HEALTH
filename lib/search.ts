import { tavilyKey } from "./env";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

const GHANA_SITES = [
  "ghs.gov.gh",
  "moh.gov.gh",
  "who.int",
  "afro.who.int",
  "cdc.gov",
  "reliefweb.int",
  "promedmail.org",
  "ourworldindata.org",
  "ghanahealthservice.org",
  "statsghana.gov.gh",
  "mofa.gov.gh",
];

export async function webSearch(query: string, max = 6): Promise<SearchHit[]> {
  const q = `${query} Ghana health`;
  const tavily = await tavilySearch(q, max);
  if (tavily.length) return tavily;
  return duckDuckGo(q, max);
}

async function tavilySearch(query: string, max: number): Promise<SearchHit[]> {
  const key = tavilyKey();
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: "advanced",
        include_answer: false,
        max_results: max,
        include_domains: GHANA_SITES,
      }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (json.results || []).map((r) => ({
      title: r.title || r.url || "Result",
      url: r.url || "",
      snippet: (r.content || "").slice(0, 320),
      source: "tavily",
    }));
  } catch {
    return [];
  }
}

async function duckDuckGo(query: string, max: number): Promise<SearchHit[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ONE-HEALTH-GHANA/1.0 (public-health research)" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    const re =
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < max) {
      hits.push({
        title: strip(m[2]),
        url: unwrapDuck(m[1]),
        snippet: strip(m[3]).slice(0, 320),
        source: "duckduckgo",
      });
    }
    if (hits.length) return hits;
    const loose =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = loose.exec(html)) && hits.length < max) {
      hits.push({
        title: strip(m[2]),
        url: unwrapDuck(m[1]),
        snippet: "",
        source: "duckduckgo",
      });
    }
    return hits;
  } catch {
    return [];
  }
}

function strip(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function unwrapDuck(href: string) {
  try {
    const u = new URL(href, "https://html.duckduckgo.com");
    return u.searchParams.get("uddg") || href;
  } catch {
    return href;
  }
}

export function formatHits(hits: SearchHit[]): string {
  if (!hits.length) return "No live web results were retrieved.";
  return hits
    .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
    .join("\n");
}
