import { createHmac, timingSafeEqual } from "crypto";
import { sessionSecret } from "./env";

export function signPayload(body: unknown) {
  const canonical = JSON.stringify(body);
  const signature = createHmac("sha256", sessionSecret()).update(canonical).digest("hex");
  return {
    alg: "HMAC-SHA256",
    signedAt: new Date().toISOString(),
    signature,
    body,
  };
}

export function verifyPayload(pack: { signature?: string; body?: unknown }) {
  if (!pack?.signature || pack.body === undefined) return { ok: false, reason: "missing signature or body" };
  const expected = createHmac("sha256", sessionSecret()).update(JSON.stringify(pack.body)).digest("hex");
  const a = Buffer.from(pack.signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch — pack was altered or signed with another secret" };
  return { ok: true, reason: "signature valid for this server secret" };
}
