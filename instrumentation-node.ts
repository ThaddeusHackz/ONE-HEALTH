/**
 * Node-only bootstrap, loaded ONLY from instrumentation.ts's register() under
 * `process.env.NEXT_RUNTIME === "nodejs"`.
 *
 * Next compiles instrumentation for BOTH the Node and Edge runtimes. This file
 * (and everything it pulls in - lib/store → fs, lib/pg-pool → pg) must never be
 * part of the Edge bundle, so it lives behind the dynamic import in
 * instrumentation.ts. Importing `fs` here is safe; importing it from
 * instrumentation.ts itself used to break the Edge compile and 500 every route
 * in `next dev`.
 */
import { hydrateFromPostgres } from "./lib/store";

export async function bootstrap(): Promise<void> {
  await hydrateFromPostgres();

  // Warm the Gemini model-catalogue cache in the background so the first chat
  // turn never waits on it. A failure here is invisible - the chain then
  // filters itself on the first real request (or runs unfiltered).
  void import("./lib/llm")
    .then((llm) => llm.liveModels([...llm.CHAT_MODELS, ...llm.FREE_MODELS]))
    .catch(() => undefined);

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
