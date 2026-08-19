import { NextResponse } from "next/server";
import { clearCookieHeader } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", clearCookieHeader());
  return res;
}
