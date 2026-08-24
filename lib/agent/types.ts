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
  | "plan"
  | "ask"
  | "sandbox_request"
  | "sandbox_result"
  | "memory"
  | "status"
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

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  language: string;
  content: string;
  updatedAt: string;
  /** Present on server listings, which omit the body. */
  bytes?: number;
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
