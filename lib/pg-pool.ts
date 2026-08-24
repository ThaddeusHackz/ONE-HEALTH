import type { Pool } from "pg";

/**
 * One shared Postgres pool for the whole process.
 *
 * The previous code opened a fresh `pg.Client` for every snapshot write and
 * every archive event, then closed it. On a Render free Postgres (256 MB, a
 * small connection ceiling) a burst of agent activity - several audit rows per
 * turn - created a connection storm and intermittently dropped writes.
 */

let pool: Pool | null = null;
let warned = false;

export function databaseUrl(): string {
  return (process.env.DATABASE_URL || "").trim();
}

export function postgresConfigured(): boolean {
  return Boolean(databaseUrl());
}

export async function getPool(): Promise<Pool | null> {
  const url = databaseUrl();
  if (!url) return null;
  if (pool) return pool;
  try {
    const { Pool: PgPool } = await import("pg");
    pool = new PgPool({
      connectionString: url,
      ssl: /render\.com|sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined,
      max: 2,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 8000,
      allowExitOnIdle: true,
    });
    pool.on("error", (err: Error) => {
      if (!warned) {
        warned = true;
        console.error("[pg] pool error", err.message);
      }
    });
  } catch (err) {
    console.error("[pg] pool unavailable", (err as Error).message);
    return null;
  }
  return pool;
}

export interface QueryResult {
  rows: unknown[];
  rowCount: number | null;
}

export async function query(text: string, params: unknown[] = []): Promise<QueryResult | null> {
  const p = await getPool();
  if (!p) return null;
  return p.query(text, params as never[]);
}

export async function closePool() {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end().catch(() => undefined);
}
