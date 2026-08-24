export interface KnowledgeItem {
  id: string;
  title: string;
  body: string;
}

export interface DocumentRow {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: string;
  analysis: string;
  createdAt: string;
  model: string;
}

export interface ChatRow {
  id: string;
  title: string;
  messages: { role: string; content: string; model?: string }[];
  model: string;
  createdAt: string;
}

export interface ForecastRow {
  id: string;
  diseaseId: string;
  regionId: string;
  latest: number;
  nextWeek: number;
  z: number;
  summary: string;
  createdAt: string;
}

export interface OfficialSeries {
  id: string;
  diseaseId: string;
  regionId: string;
  districtId?: string;
  source: string;
  points: { date: string; cases: number }[];
  createdAt: string;
}

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  model?: string;
  redactions: number;
  detail: string;
}

export interface ActivityRow {
  id: string;
  actor: string;
  action: string;
  detail: string;
  at: string;
}

export interface MemoryFactRow {
  id: string;
  text: string;
  tag: string;
  createdAt: string;
  updatedAt: string;
  hits: number;
}

export interface AgentConversationRow {
  id: string;
  title: string;
  mode: string;
  model: string;
  messages: { role: string; content: string; model?: string; at?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentFileRow {
  id: string;
  name: string;
  language: string;
  content: string;
  bytes: number;
  createdAt: string;
  updatedAt: string;
}
