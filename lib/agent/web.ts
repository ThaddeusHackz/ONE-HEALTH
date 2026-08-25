import { tavilyKey } from "@/lib/env";

/**
 * Live web layer for the AI Agent.
 * Tavily is the primary engine; DuckDuckGo HTML is the no-key fallback so the
 * agent never goes blind on a free Render instance.
 */

export interface AgentSearchHit {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  published?: string;
  source: "tavily" | "duckduckgo";
}

export interface AgentSearchResult {
  query: string;
  answer: string;
  hits: AgentSearchHit[];
  images: { url: string; alt: string }[];
  engine: string;
}

const SAFE_MAX = 10;

export async function agentWebSearch(opts: {
  query: string;
  maxResults?: number;
  topic?: "general" | "news";
  days?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeImages?: boolean;
}): Promise<AgentSearchResult> {
  const max = Math.min(Math.max(opts.maxResults ?? 6, 1), SAFE_MAX);
  const primary = await tavilySearch(opts);
  if (primary.hits.length) return primary;
  const duck = await duckduckgo(opts.query, max);
  return { query: opts.query, answer: "", hits: duck, images: [], engine: "duckduckgo" };
}

async function tavilySearch(opts: {
  query: string;
  maxResults?: number;
  topic?: "general" | "news";
  days?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeImages?: boolean;
}): Promise<AgentSearchResult> {
  const empty: AgentSearchResult = {
    query: opts.query,
    answer: "",
    hits: [],
    images: [],
    engine: "tavily",
  };
  const key = tavilyKey();
  if (!key) return empty;

  const payload: Record<string, unknown> = {
    query: opts.query,
    search_depth: "advanced",
    max_results: Math.min(Math.max(opts.maxResults ?? 6, 1), SAFE_MAX),
    topic: opts.topic || "general",
    include_answer: "basic",
    include_raw_content: false,
    include_images: Boolean(opts.includeImages),
  };
  if (opts.days && opts.days > 0) payload.time_range = opts.days <= 1 ? "day" : opts.days <= 7 ? "week" : opts.days <= 31 ? "month" : "year";
  if (opts.includeDomains?.length) payload.include_domains = opts.includeDomains;
  if (opts.excludeDomains?.length) payload.exclude_domains = opts.excludeDomains;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ api_key: key, ...payload }),
      signal: ctrl.signal,
    });
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      answer?: string;
      images?: { url?: string; description?: string }[] | string[];
      results?: { title?: string; url?: string; content?: string; score?: number; published_date?: string }[];
    };
    return {
      query: opts.query,
      answer: json.answer || "",
      engine: "tavily",
      hits: (json.results || []).map((r) => ({
        title: r.title || r.url || "Result",
        url: r.url || "",
        snippet: (r.content || "").slice(0, 700),
        score: r.score,
        published: r.published_date,
        source: "tavily" as const,
      })),
      images: (json.images || [])
        .map((img) =>
          typeof img === "string"
            ? { url: img, alt: "" }
            : { url: img.url || "", alt: img.description || "" },
        )
        .filter((i) => i.url)
        .slice(0, 6),
    };
  } catch {
    return empty;
  } finally {
    clearTimeout(t);
  }
}

async function duckduckgo(query: string, max: number): Promise<AgentSearchHit[]> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "ONE-HEALTH-GHANA/1.0 (public-health research)" },
    });
    if (!res.ok) return [];
    // Capped read: a hostile or broken upstream must not buffer unbounded HTML.
    const html = await readCapped(res, 1_000_000);
    const hits: AgentSearchHit[] = [];
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < max) {
      hits.push({
        title: strip(m[2]),
        url: unwrap(m[1]),
        snippet: strip(m[3] || "").slice(0, 400),
        source: "duckduckgo",
      });
    }
    return hits;
  } catch {
    return [];
  }
}

/**
 * Read a response body up to a byte cap. The agent's web_fetch hands the model
 * arbitrary URLs, and `res.text()` would buffer a whole ISO/tarball/CSV in RAM
 * before we slice it to a few thousand characters - a 512 MB instance would
 * die long before the cap mattered. Cap the read instead.
 */
export async function readCapped(res: Response, capBytes: number): Promise<string> {
  if (!res.body) return (await res.text().catch(() => "")).slice(0, capBytes);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let received = 0;
  const chunkBuf: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.length;
      chunkBuf.push(value);
      if (received >= capBytes) {
        try {
          await reader.cancel();
        } catch {
          /* connection already closing */
        }
        break;
      }
    }
  }
  out = decoder.decode(concatChunks(chunkBuf, capBytes), { stream: false });
  return out;
}

function concatChunks(chunks: Uint8Array[], capBytes: number): Uint8Array {
  const total = Math.min(chunks.reduce((n, c) => n + c.length, 0), capBytes);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    if (offset >= total) break;
    const take = Math.min(c.length, total - offset);
    out.set(c.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

/** Server-side page reader: HTML → readable text, hard capped for prompt safety. */
export async function fetchPageText(url: string, maxChars = 6000): Promise<{ title: string; text: string; url: string }> {
  const parsed = safeUrl(url);
  if (!parsed) return { title: "", text: "Refused: not a readable http(s) URL.", url };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(parsed, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OneHealthGhanaAgent/1.0; +https://one-health-ghana.onrender.com)",
        Accept: "text/html,application/xhtml+xml,text/plain,application/json",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const ctype = res.headers.get("content-type") || "";
    // ~2 MB of source is far more than any readable page needs; the text is
    // sliced down to maxChars anyway, and the cap keeps memory flat.
    const raw = await readCapped(res, 2_000_000);
    if (!res.ok) return { title: "", text: `HTTP ${res.status} fetching ${parsed}`, url: parsed };
    if (ctype.includes("json")) {
      return { title: parsed, text: raw.slice(0, maxChars), url: parsed };
    }
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] || parsed;
    const body = strip(raw);
    return { title: strip(title).slice(0, 200), text: body.slice(0, maxChars), url: parsed };
  } catch (err) {
    return { title: "", text: `Fetch failed: ${(err as Error).message}`, url: parsed };
  } finally {
    clearTimeout(t);
  }
}

function safeUrl(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    // Never let the agent read cloud metadata or loopback services.
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".internal") ||
      host.startsWith("169.254.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

function strip(s: string) {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrap(href: string) {
  try {
    const u = new URL(href, "https://html.duckduckgo.com");
    return u.searchParams.get("uddg") || href;
  } catch {
    return href;
  }
}

export function formatAgentHits(hits: AgentSearchHit[]): string {
  if (!hits.length) return "No live web results were retrieved.";
  return hits
    .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
    .join("\n\n");
}
