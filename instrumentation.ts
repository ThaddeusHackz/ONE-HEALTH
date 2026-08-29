export async function register() {
  // The Node-only bootstrap (lib/store → fs, lib/pg-pool → pg) must stay out of
  // the Edge compile of this file, so it is dynamically imported under the
  // runtime guard - the pattern Next documents for runtime-specific modules.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrap } = await import("./instrumentation-node");
    await bootstrap();
  }
}
