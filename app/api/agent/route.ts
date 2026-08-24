import { NextResponse } from "next/server";
import { openRouterConfigured } from "@/lib/openrouter";
import { runAgent, type AgentTurn } from "@/lib/agent/run";
import { TOOLS } from "@/lib/agent/tools";
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
  resume?: { messages: ChatMessage[]; callId: string; output: string };
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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AgentRequest;
  const mode: AgentMode = VALID_MODES.includes(body.mode as AgentMode) ? (body.mode as AgentMode) : "chat";

  const turns: AgentTurn[] = Array.isArray(body.turns)
    ? body.turns
        .filter((t) => t && (t.role === "user" || t.role === "assistant"))
        .slice(-24)
        .map((t) => ({ role: t.role, content: String(t.content || "").slice(0, 24000), attachments: t.attachments }))
    : [];

  const requested = Array.isArray(body.tools) && body.tools.length ? body.tools : TOOLS.map((t) => t.name);
  const allowedTools = TOOLS.map((t) => t.name).filter((n) => requested.includes(n));

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
          model: body.model || undefined,
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
