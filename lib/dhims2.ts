export interface DhimsPoint {
  date: string;
  cases: number;
  region?: string;
  district?: string;
  disease?: string;
}

export interface DhimsQuality {
  rows: number;
  weeks: number;
  missingWeeks: string[];
  duplicates: string[];
  negativesClipped: number;
  completeness: number;
  dateStart: string;
  dateEnd: string;
  inferred: { dateCol: string; caseCol: string };
  warnings: string[];
}

const DATE_COLS = ["date", "week_ending", "weekending", "period", "epiweek", "epi_week", "week", "startdate", "enddate"];
const CASE_COLS = ["cases", "new_cases", "confirmed", "suspected", "count", "value", "total", "notifications"];

function norm(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pickCol(headers: string[], candidates: string[]) {
  const n = headers.map(norm);
  for (const c of candidates) {
    const i = n.findIndex((h) => h === c || h.includes(c));
    if (i >= 0) return { i, name: headers[i] };
  }
  return { i: -1, name: "" };
}

function toIso(raw: string): string {
  const t = raw.trim().replace(/\//g, "-");
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = t.match(/^(\d{4})-W?(\d{1,2})$/i);
  if (m) {
    const year = Number(m[1]);
    const week = Number(m[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const start = new Date(jan4.getTime() + (week - 1) * 7 * 86400000);
    return start.toISOString().slice(0, 10);
  }
  return "";
}

export function parseDhims2(csv: string): { points: DhimsPoint[]; quality: DhimsQuality } {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const empty: DhimsQuality = {
    rows: 0,
    weeks: 0,
    missingWeeks: [],
    duplicates: [],
    negativesClipped: 0,
    completeness: 0,
    dateStart: "",
    dateEnd: "",
    inferred: { dateCol: "", caseCol: "" },
    warnings: ["No rows"],
  };
  if (lines.length < 2) return { points: [], quality: empty };

  const headers = lines[0].split(/[,;\t]/).map((h) => h.trim());
  const dateCol = pickCol(headers, DATE_COLS);
  const caseCol = pickCol(headers, CASE_COLS);
  const regionCol = pickCol(headers, ["region", "region_name"]);
  const districtCol = pickCol(headers, ["district", "mmda", "municipality"]);
  const diseaseCol = pickCol(headers, ["disease", "condition", "indicator"]);

  const warnings: string[] = [];
  if (dateCol.i < 0 || caseCol.i < 0) {
    return { points: [], quality: { ...empty, warnings: ["Need a date/week column and a cases column (DHIMS2 / IDSR extract)."] } };
  }

  let negativesClipped = 0;
  const raw: DhimsPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(/[,;\t]/);
    const date = toIso(cols[dateCol.i] || "");
    if (!date) continue;
    let cases = Number(String(cols[caseCol.i] || "0").replace(/,/g, ""));
    if (!Number.isFinite(cases)) cases = 0;
    if (cases < 0) {
      negativesClipped += 1;
      cases = 0;
    }
    raw.push({
      date,
      cases,
      region: regionCol.i >= 0 ? cols[regionCol.i] : undefined,
      district: districtCol.i >= 0 ? cols[districtCol.i] : undefined,
      disease: diseaseCol.i >= 0 ? cols[diseaseCol.i] : undefined,
    });
  }

  const byDate = new Map<string, number>();
  const duplicates: string[] = [];
  for (const p of raw) {
    if (byDate.has(p.date)) duplicates.push(p.date);
    byDate.set(p.date, (byDate.get(p.date) || 0) + p.cases);
  }
  const points = [...byDate.entries()]
    .map(([date, cases]) => ({ date, cases }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const missingWeeks: string[] = [];
  if (points.length >= 2) {
    const start = new Date(points[0].date + "T00:00:00Z");
    const end = new Date(points[points.length - 1].date + "T00:00:00Z");
    const have = new Set(points.map((p) => p.date));
    for (let t = start.getTime(); t <= end.getTime(); t += 7 * 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (!have.has(iso)) missingWeeks.push(iso);
    }
  }

  const span = points.length + missingWeeks.length;
  const completeness = span ? points.length / span : 0;
  if (completeness < 0.85) warnings.push("Completeness under 85% - nowcast and forecasts will be weak.");
  if (negativesClipped) warnings.push(`${negativesClipped} negative cells clipped to 0 (typical DHIMS2 correction).`);
  if (duplicates.length) warnings.push(`${duplicates.length} duplicate week keys were summed.`);
  if (points.length < 8) warnings.push("Fewer than 8 weeks - too short for a 4-week test window.");

  return {
    points,
    quality: {
      rows: raw.length,
      weeks: points.length,
      missingWeeks: missingWeeks.slice(0, 40),
      duplicates: [...new Set(duplicates)].slice(0, 20),
      negativesClipped,
      completeness: Number(completeness.toFixed(3)),
      dateStart: points[0]?.date || "",
      dateEnd: points[points.length - 1]?.date || "",
      inferred: { dateCol: dateCol.name, caseCol: caseCol.name },
      warnings,
    },
  };
}

export const DHIMS2_TEMPLATE = `week_ending,region,district,disease,cases
2025-01-05,Greater Accra,Accra Metro,Cholera,4
2025-01-12,Greater Accra,Accra Metro,Cholera,6
2025-01-19,Greater Accra,Accra Metro,Cholera,5
2025-01-26,Greater Accra,Accra Metro,Cholera,9
2025-02-02,Greater Accra,Accra Metro,Cholera,7
2025-02-09,Greater Accra,Accra Metro,Cholera,8
2025-02-16,Greater Accra,Accra Metro,Cholera,11
2025-02-23,Greater Accra,Accra Metro,Cholera,14
2025-03-02,Greater Accra,Accra Metro,Cholera,12
2025-03-09,Greater Accra,Accra Metro,Cholera,10
2025-03-16,Greater Accra,Accra Metro,Cholera,9
2025-03-23,Greater Accra,Accra Metro,Cholera,8
`;
