export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { hydrateFromPostgres } = await import("./lib/store");
  await hydrateFromPostgres();
}
