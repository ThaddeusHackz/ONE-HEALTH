/**
 * Capped JSON body reading for route handlers.
 *
 * Next.js App Router route handlers have NO built-in request-body limit (the
 * old 4 MB cap was the Pages API). Every route that parses a JSON body on a
 * 512 MB Render instance should read through here: the raw text is length-
 * checked before JSON.parse, so a hostile or buggy client cannot buffer an
 * arbitrarily large body into memory.
 *
 * Multipart upload routes (vision/ingest/transcribe) validate per-File sizes
 * instead; the agent route has its own larger cap for attachments.
 */

export async function readJsonBody(
  req: Request,
  maxBytes = 2_000_000,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request body too large (${(declared / 1e6).toFixed(1)} MB) - the limit is ${Math.round(maxBytes / 1e6)} MB.`,
    };
  }
  const raw = await req.text().catch(() => "");
  if (raw.length > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Request body too large (${(raw.length / 1e6).toFixed(1)} MB) - the limit is ${Math.round(maxBytes / 1e6)} MB.`,
    };
  }
  if (!raw) return { ok: true, data: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "Body must be a JSON object." };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Malformed JSON body." };
  }
}
