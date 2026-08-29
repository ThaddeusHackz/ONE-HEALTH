import { complete, geminiConfigured, type ChatMessage } from "@/lib/llm";
import { getDB, saveDB, uid } from "@/lib/store";

/**
 * Persistent agent memory.
 *
 * Three stores, all in the same snapshot table the rest of the platform uses,
 * so memory survives Render web-service restarts when DATABASE_URL is set:
 *   facts         - distilled long-term knowledge (the agent's evolving model of you)
 *   conversations - full transcripts, restorable in the sidebar
 *   files         - the virtual workspace filesystem the sandbox and artifacts write to
 */

export interface MemoryFact {
  id: string;
  text: string;
  tag: string;
  createdAt: string;
  updatedAt: string;
  hits: number;
}

export interface AgentMessageRow {
  role: string;
  content: string;
  model?: string;
  at?: string;
}

export interface AgentConversation {
  id: string;
  title: string;
  mode: string;
  model: string;
  messages: AgentMessageRow[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentFile {
  id: string;
  name: string;
  language: string;
  content: string;
  bytes: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Everything here is serialised into one Postgres jsonb row on a 1 GB free
 * database, so the caps are about snapshot size, not just tidiness. File
 * bodies get a generous cap (a Builder artefact such as a full single-file
 * dashboard must never be silently truncated after the agent verified the
 * complete code in the sandbox) - the snapshot layer trims bodies only when
 * the whole row actually exceeds its budget.
 */
const MAX_FACTS = 400;
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES_PER_CONVERSATION = 160;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_FILES = 60;
const MAX_FILE_BYTES = 800_000;

/* ------------------------------- facts ------------------------------- */

export function listFacts(): MemoryFact[] {
  return getDB().agentMemory.slice();
}

export function saveFact(text: string, tag = "general"): MemoryFact {
  const clean = text.trim().slice(0, 600);
  const now = new Date().toISOString();
  let saved: MemoryFact = { id: uid("mem"), text: clean, tag, createdAt: now, updatedAt: now, hits: 0 };
  saveDB((db) => {
    const key = clean.toLowerCase();
    const existing = db.agentMemory.find((f) => f.text.toLowerCase() === key);
    if (existing) {
      existing.tag = tag;
      existing.updatedAt = now;
      existing.hits += 1;
      saved = existing;
      return;
    }
    db.agentMemory.unshift(saved);
    db.agentMemory = db.agentMemory.slice(0, MAX_FACTS);
  });
  return saved;
}

export function deleteFact(id: string) {
  saveDB((db) => {
    db.agentMemory = db.agentMemory.filter((f) => f.id !== id);
  });
}

export function clearFacts() {
  saveDB((db) => {
    db.agentMemory = [];
  });
}

/** Lightweight keyword recall - no vector DB dependency, deterministic, cheap. */
export function recallFacts(query: string, limit = 8): MemoryFact[] {
  const facts = getDB().agentMemory;
  if (!facts.length) return [];
  const tokens = tokenize(query);
  if (!tokens.length) return facts.slice(0, limit);
  const scored = facts
    .map((f) => {
      const hay = tokenize(`${f.text} ${f.tag}`);
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score += 1;
      if (f.tag !== "general") score += 0.25;
      return { f, score: score + f.hits * 0.01 };
    })
    .filter((s) => s.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const hits = scored.map((s) => s.f);
  if (hits.length) {
    saveDB((db) => {
      for (const f of db.agentMemory) if (hits.some((h) => h.id === f.id)) f.hits += 1;
    });
  }
  return hits;
}

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/* --------------------------- conversations --------------------------- */

export function listConversations(): { id: string; title: string; mode: string; updatedAt: string; turns: number }[] {
  return getDB().agentConversations.map((c) => ({
    id: c.id,
    title: c.title,
    mode: c.mode,
    updatedAt: c.updatedAt,
    turns: c.messages.length,
  }));
}

export function getConversation(id: string): AgentConversation | null {
  return getDB().agentConversations.find((c) => c.id === id) || null;
}

export function upsertConversation(input: {
  id?: string;
  title?: string;
  mode?: string;
  model?: string;
  messages: AgentMessageRow[];
}): AgentConversation {
  const now = new Date().toISOString();
  const firstUser = input.messages.find((m) => m.role === "user")?.content || "New conversation";
  const title = (input.title || firstUser).replace(/\s+/g, " ").trim().slice(0, 90) || "New conversation";
  let row: AgentConversation = {
    id: input.id || uid("cnv"),
    title,
    mode: input.mode || "chat",
    model: input.model || "",
    messages: input.messages
      .slice(-MAX_MESSAGES_PER_CONVERSATION)
      .map((m) => ({
        ...m,
        content: typeof m.content === "string" ? m.content.slice(0, MAX_MESSAGE_CHARS) : m.content,
      })),
    createdAt: now,
    updatedAt: now,
  };
  saveDB((db) => {
    const existing = db.agentConversations.find((c) => c.id === row.id);
    if (existing) {
      existing.title = title;
      existing.mode = row.mode;
      existing.model = row.model;
      existing.messages = row.messages;
      existing.updatedAt = now;
      row = existing;
      return;
    }
    db.agentConversations.unshift(row);
    db.agentConversations = db.agentConversations.slice(0, MAX_CONVERSATIONS);
  });
  return row;
}

export function deleteConversation(id: string) {
  saveDB((db) => {
    db.agentConversations = db.agentConversations.filter((c) => c.id !== id);
  });
}

/* ------------------------------ workspace ---------------------------- */

export function listFiles(): AgentFile[] {
  return getDB().agentFiles.map(({ content, ...rest }) => ({ ...rest, content: `${content.length} chars` }));
}

export function readFile(name: string): AgentFile | null {
  const f = getDB().agentFiles.find((x) => x.name === name);
  return f ? { ...f } : null;
}

export function writeFile(name: string, content: string, language?: string): AgentFile {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file.txt";
  const body = String(content || "").slice(0, MAX_FILE_BYTES);
  const now = new Date().toISOString();
  let row: AgentFile = {
    id: uid("file"),
    name: safe,
    language: language || guessLanguage(safe),
    content: body,
    bytes: Buffer.byteLength(body, "utf8"),
    createdAt: now,
    updatedAt: now,
  };
  saveDB((db) => {
    const existing = db.agentFiles.find((f) => f.name === safe);
    if (existing) {
      existing.content = body;
      existing.language = row.language;
      existing.bytes = row.bytes;
      existing.updatedAt = now;
      row = existing;
      return;
    }
    db.agentFiles.unshift(row);
    db.agentFiles = db.agentFiles.slice(0, MAX_FILES);
  });
  return row;
}

export function deleteFile(name: string) {
  saveDB((db) => {
    db.agentFiles = db.agentFiles.filter((f) => f.name !== name);
  });
}

function guessLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "html",
    htm: "html",
    js: "javascript",
    mjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    css: "css",
    json: "json",
    md: "markdown",
    csv: "csv",
    svg: "svg",
    py: "python",
    txt: "text",
    yaml: "yaml",
    yml: "yaml",
  };
  return map[ext] || "text";
}

/* ------------------------- memory distillation ----------------------- */

/**
 * "Evolves the more with information": after a substantive turn the agent
 * distils durable facts out of the transcript and stores them. Runs on the
 * Gemini key with the cheapest chain; silently skips when unconfigured.
 */
export async function distillMemory(messages: AgentMessageRow[]): Promise<MemoryFact[]> {
  if (!geminiConfigured()) return [];
  const transcript = messages
    .slice(-12)
    .map((m) => `${m.role}: ${String(m.content).slice(0, 1200)}`)
    .join("\n");
  if (transcript.length < 120) return [];

  try {
    const result = await complete({
      json: true,
      temperature: 0.1,
      maxTokens: 500,
      messages: [
        {
          role: "system" as const,
          content: `You extract durable facts worth remembering from a conversation.
Rules:
- Only facts that will still matter in a later session (preferences, roles, projects, recurring context, corrections, Ghana health specifics).
- Never store passwords, API keys, patient names, phone numbers or folder numbers.
- 0 to 5 facts, each under 200 characters, self-contained.
Return strict JSON: {"facts":[{"text":"...","tag":"preference|project|domain|health|general"}]}`,
        },
        { role: "user" as const, content: transcript },
      ] satisfies ChatMessage[],
    });
    const parsed = JSON.parse(extractJson(result.text)) as {
      facts?: { text?: string; tag?: string }[];
    };
    const saved: MemoryFact[] = [];
    for (const fact of (parsed.facts || []).slice(0, 5)) {
      const text = (fact.text || "").trim();
      if (!text || text.length < 12) continue;
      if (/api[_ -]?key|password|token|secret/i.test(text)) continue;
      saved.push(saveFact(text, fact.tag || "general"));
    }
    return saved;
  } catch {
    return [];
  }
}

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] || text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return "{}";
}
