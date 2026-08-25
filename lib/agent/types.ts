/** Shared types for the AI Agent tab (server + client). */

export type AgentEventType =
  | "delta"
  | "reasoning"
  | "tool_start"
  | "tool_result"
  | "tool_error"
  | "citations"
  | "image"
  | "stock"
  | "file"
  | "chart"
  | "table"
  | "diagram"
  | "plan"
  | "ask"
  | "sandbox_request"
  | "sandbox_result"
  | "memory"
  | "status"
  | "model_reset"
  | "done"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  [key: string]: unknown;
}

export type ChartKind = "line" | "area" | "bar" | "pie" | "scatter" | "composed";

export interface ChartSpec {
  title: string;
  kind: ChartKind;
  /** Category labels along the x axis (or slice labels for pie). */
  x: string[];
  series: { name: string; values: number[] }[];
  note?: string;
  unit?: string;
}

export interface TableRow {
  [key: string]: string | number;
}

export interface TableSpec {
  title: string;
  columns: string[];
  rows: TableRow[];
  note?: string;
}

/**
 * A rendered diagram (flowchart, sequence, ER, state, Gantt, mind map, timeline,
 * journey, git graph, quadrant, pie, xychart, sankey, block, C4, architecture).
 *
 * The source is Mermaid, which is the diagram interchange every major assistant
 * (ChatGPT, Claude artifacts, Microsoft 365 Copilot) uses: text in, SVG out, so
 * the model's intent stays auditable and the render is deterministic.
 */
export interface DiagramSpec {
  title?: string;
  /** Mermaid source, e.g. "flowchart TD\n  A --> B". */
  source: string;
  /** Human-readable kind, for the caption: flowchart | sequence | er | state | gantt | … */
  kind?: string;
  note?: string;
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface WorkspaceFile {
  id?: string;
  name: string;
  language: string;
  content?: string;
  updatedAt: string;
  /** Present on server listings, which omit the body. */
  bytes?: number;
  /** Large disk-backed upload (up to 2 GB) rather than an in-DB artefact. */
  kind?: "upload";
  /** Uploads: true when it can be opened as text in the editor. */
  textLike?: boolean;
  /** Uploads opened in the editor: the body was cut at the preview head. */
  truncated?: boolean;
}

export type AgentMode = "chat" | "research" | "builder" | "vision" | "health";

export interface AgentAttachment {
  name: string;
  mime: string;
  dataUrl: string;
  kind: "image" | "pdf" | "doc" | "text";
  text?: string;
  bytes: number;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  model?: string;
  at: string;
  events: AgentEvent[];
  attachments?: AgentAttachment[];
  toolLog?: { name: string; ok: boolean; summary: string }[];
  pending?: string;
}

export interface SandboxResult {
  callId: string;
  ok: boolean;
  stdout: string;
  result?: string;
  error?: string;
  ms: number;
}
