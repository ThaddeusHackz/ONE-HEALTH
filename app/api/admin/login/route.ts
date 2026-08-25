import { NextResponse } from "next/server";
import { cookieHeader, login, makeSession } from "@/lib/auth";
import { logActivity } from "@/lib/store";
import { readJsonBody } from "@/lib/body";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const read = await readJsonBody(req, 8_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as { email?: string; password?: string };
  const user = login(body.email || "", body.password || "");
  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  logActivity(user.email, "login", "admin desk");
  const res = NextResponse.json({ ok: true, email: user.email, name: user.name });
  res.headers.set("Set-Cookie", cookieHeader(makeSession(user.email)));
  return res;
}
