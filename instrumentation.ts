export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { hydrateFromPostgres } = await import("./lib/store");
  await hydrateFromPostgres();

  /**
   * Snapshot writes are coalesced, so a pending write can be in flight when
   * Render sends SIGTERM before a restart. Flush it, or the newest agent
   * memory and conversations are lost with the ephemeral disk.
   */
  const flush = async () => {
    try {
      const { flushPgSnapshot } = await import("./lib/pg-store");
      const { closePool } = await import("./lib/pg-pool");
      await flushPgSnapshot();
      await closePool();
    } catch {
      /* shutdown must never throw */
    }
  };
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void flush().finally(() => process.exit(0));
      setTimeout(() => process.exit(0), 4000).unref();
    });
  }
}
