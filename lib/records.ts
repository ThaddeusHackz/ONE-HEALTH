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
