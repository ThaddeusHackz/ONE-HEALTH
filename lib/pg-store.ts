import { postgresConfigured, query } from "./pg-pool";

type Snapshot = Record<string, unknown>;

export { postgresConfigured };

/**
 * The whole app state lives in ONE jsonb row. That is deliberate - it survives
 * Render's ephemeral filesystem and needs no migrations - but it makes payload
 * size a real limit: a Render free Postgres holds 1 GB total and expires 30 days
 * after creation. So the snapshot is capped, and anything oversized is trimmed
 * (workspace file bodies first, then old conversation messages) before writing.
 */
const MAX_SNAPSHOT_BYTES = 12_000_000;
const MIN_FILE_BODY_BYTES = 4_000;

const ENSURE = `
  CREATE TABLE IF NOT EXISTS ohg_snapshot (
    id INTEGER PRIMARY KEY,
    body JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

function sizeOf(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Drop the least important bytes until the row fits. Never throws. */
export function trimSnapshot(input: Snapshot, budget = MAX_SNAPSHOT_BYTES): { body: Snapshot; bytes: number; trimmed: string[] } {
  const trimmed: string[] = [];
  const body = JSON.parse(JSON.stringify(input)) as Snapshot;
  let bytes = sizeOf(body);
  if (bytes <= budget) return { body, bytes, trimmed };

  // 1. Workspace file bodies - they can be re-created; metadata is what matters.
  const files = (body.agentFiles as { name: string; content: string; bytes: number }[] | undefined) || [];
  if (files.length) {
    body.agentFiles = files.map((f) =>
      f.content && f.content.length > MIN_FILE_BODY_BYTES
        ? { ...f, content: `${f.content.slice(0, MIN_FILE_BODY_BYTES)}\n…[trimmed for snapshot size]` }
        : f,
    );
    bytes = sizeOf(body);
    trimmed.push("workspace file bodies");
  }
  if (bytes <= budget) return { body, bytes, trimmed };

  // 2. Long conversation transcripts.
  const conversations = (body.agentConversations as { messages: { content: string }[] }[] | undefined) || [];
  if (conversations.length) {
    body.agentConversations = conversations.map((c) => ({
      ...c,
      messages: (c.messages || []).slice(-80).map((m) =>
        typeof m.content === "string" && m.content.length > 4000 ? { ...m, content: `${m.content.slice(0, 4000)}…` } : m,
      ),
    }));
    bytes = sizeOf(body);
    trimmed.push("conversation transcripts");
  }
  if (bytes <= budget) return { body, bytes, trimmed };

  // 3. Legacy chat log.
  const chats = (body.chats as { messages: { content: string }[] }[] | undefined) || [];
  if (chats.length) {
    body.chats = chats.slice(0, 40);
    bytes = sizeOf(body);
    trimmed.push("legacy chat log");
  }
  if (bytes <= budget) return { body, bytes, trimmed };

  // 4. Document analyses.
  if (Array.isArray(body.documents) && body.documents.length) {
    body.documents = (body.documents as { analysis?: string }[]).map((d) => ({
      ...d,
      analysis: typeof d.analysis === "string" ? d.analysis.slice(0, 1200) : d.analysis,
    }));
    bytes = sizeOf(body);
    trimmed.push("document analyses");
  }

  return { body, bytes, trimmed };
}

export async function loadPgSnapshot(): Promise<Snapshot | null> {
  if (!postgresConfigured()) return null;
  try {
    await query(ENSURE);
    const res = await query("SELECT body FROM ohg_snapshot WHERE id = 1");
    const row = res?.rows?.[0] as { body?: Snapshot } | undefined;
    return row?.body || null;
  } catch (err) {
    console.error("[pg] load snapshot", (err as Error).message);
    return null;
  }
}

/**
 * Writes are coalesced: the first change in a window goes out immediately, and
 * a burst of writes (several audit rows in one agent turn) collapses into one
 * trailing write instead of a full-row rewrite each time.
 */
const MIN_WRITE_INTERVAL_MS = 3000;
let pending: Snapshot | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastWrite = 0;

export function savePgSnapshot(body: Snapshot): void {
  pending = body;
  if (timer) return;
  const wait = Math.max(0, MIN_WRITE_INTERVAL_MS - (Date.now() - lastWrite));
  timer = setTimeout(() => {
    timer = null;
    void flushPgSnapshot();
  }, wait);
  timer.unref?.();
}

export async function flushPgSnapshot(): Promise<boolean> {
  const body = pending;
  pending = null;
  if (!body || !postgresConfigured()) return false;
  try {
    const { body: trimmedBody, bytes, trimmed } = trimSnapshot(body);
    if (trimmed.length) {
      console.warn(`[pg] snapshot trimmed (${trimmed.join(", ")}) to ${(bytes / 1e6).toFixed(1)}MB`);
    }
    await query(ENSURE);
    await query(
      `INSERT INTO ohg_snapshot (id, body, updated_at) VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()`,
      [JSON.stringify(trimmedBody)],
    );
    lastWrite = Date.now();
    return true;
  } catch (err) {
    console.error("[pg] save snapshot", (err as Error).message);
    // Put it back so the next save attempt carries the latest state.
    if (!pending) pending = body;
    return false;
  }
}
