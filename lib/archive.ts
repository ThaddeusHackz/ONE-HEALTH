import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { query } from "./pg-pool";

export interface ArchiveEvent {
  id: string;
  at: string;
  type: string;
  actor: string;
  payload: unknown;
}

const DIR = join(process.cwd(), "data");
const LOG = join(DIR, "events.jsonl");

/**
 * Render's filesystem is ephemeral and small, and the free Postgres is capped at
 * 1 GB, so the event log is bounded on both sides: the local file rotates at
 * MAX_LOCAL_BYTES and the table is trimmed to MAX_ROWS every TRIM_EVERY inserts.
 */
const MAX_LOCAL_BYTES = 2_000_000;
const KEEP_LOCAL_BYTES = 400_000;
const MAX_ROWS = 20_000;
const TRIM_EVERY = 500;

let insertCount = 0;

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
    rotateIfNeeded();
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

/** Keeps the on-disk log from growing without bound between Render redeploys. */
function rotateIfNeeded() {
  try {
    if (!existsSync(LOG)) return;
    const size = statSync(LOG).size;
    if (size <= MAX_LOCAL_BYTES) return;
    const tail = readFileSync(LOG, "utf8").slice(-KEEP_LOCAL_BYTES);
    const firstBreak = tail.indexOf("\n");
    writeFileSync(LOG, firstBreak >= 0 ? tail.slice(firstBreak + 1) : tail, "utf8");
    console.info(`[archive] rotated ${Math.round(size / 1024)}KB log down to ${KEEP_LOCAL_BYTES / 1024}KB`);
  } catch (err) {
    console.error("[archive] rotate failed", (err as Error).message);
  }
}

async function pushPostgres(ev: ArchiveEvent) {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ohg_events (
        id TEXT PRIMARY KEY,
        at TIMESTAMPTZ NOT NULL,
        type TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload JSONB NOT NULL
      )
    `);
    await query(
      "INSERT INTO ohg_events (id, at, type, actor, payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
      [ev.id, ev.at, ev.type, ev.actor, ev.payload],
    );
    insertCount += 1;
    if (insertCount % TRIM_EVERY === 0) {
      await query(
        `DELETE FROM ohg_events WHERE id NOT IN (
           SELECT id FROM ohg_events ORDER BY at DESC LIMIT $1
         )`,
        [MAX_ROWS],
      );
    }
  } catch (err) {
    console.error("[archive] postgres skip", (err as Error).message);
  }
}
