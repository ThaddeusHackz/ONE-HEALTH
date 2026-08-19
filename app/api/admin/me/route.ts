import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const admin = currentAdmin(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ email: admin.email, name: admin.name });
}
