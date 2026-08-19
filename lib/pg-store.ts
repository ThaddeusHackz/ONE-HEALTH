type Snapshot = Record<string, unknown>;

function databaseUrl() {
  return (process.env.DATABASE_URL || "").trim();
}

async function client() {
  const url = databaseUrl();
  if (!url) return null;
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: url,
    ssl: /render\.com|sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  await c.connect();
  await c.query(`
    CREATE TABLE IF NOT EXISTS ohg_snapshot (
      id INTEGER PRIMARY KEY,
      body JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return c;
}

export function postgresConfigured() {
  return Boolean(databaseUrl());
}

export async function loadPgSnapshot(): Promise<Snapshot | null> {
  const c = await client();
  if (!c) return null;
  try {
    const res = (await c.query("SELECT body FROM ohg_snapshot WHERE id = 1")) as { rows: { body: Snapshot }[] };
    return res.rows[0]?.body || null;
  } catch (err) {
    console.error("[pg] load snapshot", (err as Error).message);
    return null;
  } finally {
    await c.end().catch(() => undefined);
  }
}

export async function savePgSnapshot(body: Snapshot) {
  const c = await client();
  if (!c) return;
  try {
    await c.query(
      `INSERT INTO ohg_snapshot (id, body, updated_at) VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()`,
      [body],
    );
  } catch (err) {
    console.error("[pg] save snapshot", (err as Error).message);
  } finally {
    await c.end().catch(() => undefined);
  }
}
