import { NextResponse } from "next/server";
import { cookieHeader, login, makeSession } from "@/lib/auth";
import { logActivity } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = login(body.email || "", body.password || "");
  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  logActivity(user.email, "login", "admin desk");
  const res = NextResponse.json({ ok: true, email: user.email, name: user.name });
  res.headers.set("Set-Cookie", cookieHeader(makeSession(user.email)));
  return res;
}
