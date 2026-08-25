import { NextResponse } from "next/server";
import { openRouterConfigured } from "@/lib/openrouter";
import { runAgent, type AgentTurn } from "@/lib/agent/run";
import { TOOLS } from "@/lib/agent/tools";
import { isValidModelSlug } from "@/lib/agent/models";
import type { AgentAttachment, AgentMode } from "@/lib/agent/types";
import type { ChatMessage } from "@/lib/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

interface AgentRequest {
  turns?: AgentTurn[];
  mode?: AgentMode;
  tools?: string[];
  model?: string;
  temperature?: number;
  reasoning?: boolean;
  conversationId?: string;
  attachments?: AgentAttachment[];
  resume?: { messages: ChatMessage[]; callId: string; output: string; priorText?: string };
}

const VALID_MODES: AgentMode[] = ["chat", "research", "builder", "vision", "health"];

export function GET() {
  return NextResponse.json({
    ok: true,
    configured: openRouterConfigured(),
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      client: Boolean(t.clientOnly),
    })),
  });
}

/**
 * Render free instances have 512 MB of RAM. Attachments arrive as base64 inside
 * JSON, so the body cap keeps the parsed object comfortably inside that. Files
 * larger than this belong in the workspace through the chunked 2 GB upload
 * endpoint (/api/agent/upload), not inline in a turn.
 */
const MAX_BODY_BYTES = 40_000_000;

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        error: `Request too large (${(declared / 1e6).toFixed(1)} MB). Attach fewer or smaller files - the limit is ${Math.round(
          MAX_BODY_BYTES / 1e6,
        )} MB.`,
      },
      { status: 413 },
    );
  }

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Request too large (${(raw.length / 1e6).toFixed(1)} MB). Attach fewer or smaller files.` },
      { status: 413 },
    );
  }

  let body: AgentRequest = {};
  try {
    body = raw ? (JSON.parse(raw) as AgentRequest) : {};
  } catch {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }
  const mode: AgentMode = VALID_MODES.includes(body.mode as AgentMode) ? (body.mode as AgentMode) : "chat";

  /**
   * Attachments arrive BOTH places: on turns (older clients) and as a
   * top-level array (what useAgent actually sends). They are validated and
   * merged onto the LAST user turn, because that is where runAgent's tool
   * context looks for them. Without this merge the vision_read tool receives
   * an empty context and can never see a file - the attachment reaches the
   * model as a name in the prompt but the file itself never arrives.
   */
  const validAttachment = (a: unknown): AgentAttachment | null => {
    if (!a || typeof a !== "object") return null;
    const att = a as Partial<AgentAttachment>;
    const name = typeof att.name === "string" ? att.name.slice(0, 200) : "attachment";
    const mime = typeof att.mime === "string" ? att.mime.slice(0, 120) : "application/octet-stream";
    const dataUrl = typeof att.dataUrl === "string" ? att.dataUrl : "";
    if (!dataUrl.startsWith("data:")) return null;
    if (dataUrl.length > 11_000_000) return null; // ≈8 MB binary before base64
    const kind =
      att.kind === "image" || att.kind === "pdf" || att.kind === "doc" || att.kind === "text" ? att.kind : "text";
    return {
      name,
      mime,
      dataUrl,
      kind,
      text: typeof att.text === "string" ? att.text.slice(0, 60_000) : undefined,
      bytes: Number(att.bytes) || Math.floor((dataUrl.length * 3) / 4),
    };
  };

  const MAX_ATTACHMENTS = 8;
  const topAttachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .map(validAttachment)
    .filter((a): a is AgentAttachment => Boolean(a))
    .slice(0, MAX_ATTACHMENTS);

  const turns: AgentTurn[] = Array.isArray(body.turns)
    ? body.turns
        .filter((t) => t && (t.role === "user" || t.role === "assistant"))
        .slice(-24)
        .map((t) => ({
          role: t.role,
          content: String(t.content || "").slice(0, 24000),
          attachments: (Array.isArray(t.attachments) ? t.attachments : [])
            .map(validAttachment)
            .filter((a): a is AgentAttachment => Boolean(a))
            .slice(0, MAX_ATTACHMENTS),
        }))
    : [];

  if (topAttachments.length) {
    // Merge onto the last user turn - the turn vision_read reads.
    let merged = false;
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      if (turns[i].role === "user") {
        const existing = turns[i].attachments || [];
        const seen = new Set(existing.map((a) => `${a.name}:${a.bytes}`));
        turns[i].attachments = [
          ...existing,
          ...topAttachments.filter((a) => !seen.has(`${a.name}:${a.bytes}`)),
        ].slice(0, MAX_ATTACHMENTS);
        merged = true;
        break;
      }
    }
    if (!merged && !turns.some((t) => t.role === "user" && (t.attachments || []).length)) {
      turns.push({ role: "user", content: "(attachment)", attachments: topAttachments });
    }
  }

  const requested = Array.isArray(body.tools) && body.tools.length ? body.tools : TOOLS.map((t) => t.name);
  const allowedTools = TOOLS.map((t) => t.name).filter((n) => requested.includes(n));

  /** A pinned model must be a real slug; anything odd is treated as Auto. */
  const model = typeof body.model === "string" && isValidModelSlug(body.model.trim()) ? body.model.trim() : undefined;

  if (!turns.length && !body.resume) {
    return NextResponse.json({ error: "No conversation turns supplied." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client hung up */
        }
      };

      try {
        const result = await runAgent({
          turns,
          mode,
          allowedTools,
          model,
          temperature: typeof body.temperature === "number" ? Math.min(Math.max(body.temperature, 0), 1.5) : undefined,
          reasoning: Boolean(body.reasoning),
          conversationId: body.conversationId || undefined,
          resume: body.resume,
          emit: (event) => send(event.type, event),
        });
        send("result", {
          text: result.text,
          model: result.model,
          conversationId: result.conversationId,
          toolLog: result.toolLog,
          pending: result.pending
            ? { callId: result.pending.callId, name: result.pending.name, payload: result.pending.payload, messages: result.pending.messages }
            : null,
        });
      } catch (err) {
        const message = (err as Error).message || "Agent failure";
        send("error", { message });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
