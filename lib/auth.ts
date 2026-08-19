import { createHmac, timingSafeEqual } from "crypto";
import { adminEmail, sessionSecret } from "./env";
import { getDB, verifyPassword } from "./store";

const COOKIE = "ohg_admin";
const MAX_AGE = 60 * 60 * 24 * 7;

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function makeSession(email: string) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSession(token?: string | null): { email: string } | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email: string; exp: number };
    if (data.exp < Date.now()) return null;
    return { email: data.email };
  } catch {
    return null;
  }
}

function cookieFlags() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export function cookieHeader(token: string) {
  return `${COOKIE}=${token}; ${cookieFlags()}`;
}

export function clearCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function tokenFromRequest(req: Request) {
  const raw = req.headers.get("cookie") || "";
  const part = raw.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  return part?.slice(COOKIE.length + 1) || null;
}

export function currentAdmin(req: Request) {
  const sess = readSession(tokenFromRequest(req));
  if (!sess) return null;
  return getDB().admins.find((a) => a.email === sess.email) || null;
}

export function login(email: string, password: string) {
  const user = getDB().admins.find((a) => a.email === email.trim().toLowerCase());
  if (!user) return null;
  if (!verifyPassword(password, user.salt, user.passwordHash)) return null;
  return user;
}

export function requireAdmin(req: Request) {
  return currentAdmin(req);
}

export { adminEmail };
