import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/body";
import {
  clearFacts,
  deleteConversation,
  deleteFact,
  getConversation,
  listConversations,
  listFacts,
  recallFacts,
  saveFact,
} from "@/lib/agent/memory";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation");
  if (conversationId) {
    const conversation = getConversation(conversationId);
    return conversation
      ? NextResponse.json({ conversation })
      : NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  const q = url.searchParams.get("q");
  return NextResponse.json({
    facts: q ? recallFacts(q, 12) : listFacts(),
    conversations: listConversations(),
  });
}

export async function POST(req: Request) {
  const read = await readJsonBody(req, 64_000);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
  const body = read.data as {
    action?: "save" | "delete" | "clear" | "deleteConversation";
    fact?: string;
    tag?: string;
    id?: string;
  };
  if (body.action === "delete" && body.id) {
    deleteFact(body.id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "clear") {
    clearFacts();
    return NextResponse.json({ ok: true });
  }
  if (body.action === "deleteConversation" && body.id) {
    deleteConversation(body.id);
    return NextResponse.json({ ok: true });
  }
  if (!body.fact?.trim()) {
    return NextResponse.json({ error: "fact required" }, { status: 400 });
  }
  return NextResponse.json({ fact: saveFact(body.fact, body.tag || "general") });
}
