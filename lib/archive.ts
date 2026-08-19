import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

export interface ArchiveEvent {
  id: string;
  at: string;
  type: string;
  actor: string;
  payload: unknown;
}

const DIR = join(process.cwd(), "data");
const LOG = join(DIR, "events.jsonl");

export function appendEvent(type: string, actor: string, payload: unknown): ArchiveEvent {
  const ev: ArchiveEvent = {
    id: `ev_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`,
    at: new Date().toISOString(),
    type,
    actor,
    payload,
  };
  try {
    mkdirSync(DIR, { recursive: true });
    appendFileSync(LOG, `${JSON.stringify(ev)}\n`, "utf8");
  } catch (err) {
    console.error("[archive] disk append failed", (err as Error).message);
  }
  void pushPostgres(ev);
  return ev;
}

export function archiveStats() {
  try {
    if (!existsSync(LOG)) return { bytes: 0, exists: false, path: LOG };
    return { bytes: statSync(LOG).size, exists: true, path: LOG };
  } catch {
    return { bytes: 0, exists: false, path: LOG };
  }
}

export function readRecentEvents(limit = 200): ArchiveEvent[] {
  try {
    if (!existsSync(LOG)) return [];
    const lines = readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l) as ArchiveEvent);
  } catch {
    return [];
  }
}

export function readArchiveRaw(): string {
  try {
    if (!existsSync(LOG)) return "";
    return readFileSync(LOG, "utf8");
  } catch {
    return "";
  }
}

async function pushPostgres(ev: ArchiveEvent) {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) return;
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url, ssl: url.includes("render.com") ? { rejectUnauthorized: false } : undefined });
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS ohg_events (
        id TEXT PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload JSONB NOT NULL
      )
    `);
    await client.query(
      "INSERT INTO ohg_events (id, at, type, actor, payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
      [ev.id, ev.at, ev.type, ev.actor, ev.payload],
    );
    await client.end();
  } catch (err) {
    console.error("[archive] postgres skip", (err as Error).message);
  }
}
