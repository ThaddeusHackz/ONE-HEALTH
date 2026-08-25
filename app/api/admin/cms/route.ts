import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/body";
import { requireAdmin } from "@/lib/auth";
import { getDB, logActivity, saveDB } from "@/lib/store";
import type { NavItem, SiteContent } from "@/lib/cms";
import type { KnowledgeItem } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = getDB();
  return NextResponse.json({
    content: db.content,
    nav: db.nav,
    knowledge: db.knowledge,
    documents: db.documents,
    chats: db.chats,
    forecasts: db.forecasts,
    activity: db.activity.slice(0, 80),
    admins: db.admins.map((a) => ({ id: a.id, email: a.email, name: a.name })),
  });
}

export async function PUT(req: Request) {
  const admin = requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const read = await readJsonBody(req, 2_000_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as {
    content?: Partial<SiteContent>;
    nav?: NavItem[];
    knowledge?: KnowledgeItem[];
  };
  saveDB((db) => {
    if (body.content) db.content = { ...db.content, ...body.content };
    if (body.nav) db.nav = body.nav;
    if (body.knowledge) db.knowledge = body.knowledge;
  });
  logActivity(admin.email, "cms.update", Object.keys(body).join(","));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id");
  if (!kind || !id) return NextResponse.json({ error: "kind and id required" }, { status: 400 });
  saveDB((db) => {
    if (kind === "documents") db.documents = db.documents.filter((d) => d.id !== id);
    if (kind === "chats") db.chats = db.chats.filter((d) => d.id !== id);
    if (kind === "forecasts") db.forecasts = db.forecasts.filter((d) => d.id !== id);
    if (kind === "knowledge") db.knowledge = db.knowledge.filter((d) => d.id !== id);
  });
  logActivity(admin.email, "delete", `${kind}:${id}`);
  return NextResponse.json({ ok: true });
}
