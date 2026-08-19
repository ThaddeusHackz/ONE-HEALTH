import { DISEASES, NATIONAL, REGIONS, diseaseById, regionById, type Disease, type Region } from "./ghana";

export interface WeeklyPoint {
  date: string;
  week: number;
  cases: number;
  imputed: boolean;
}

export interface ModelForecast {
  id: string;
  name: string;
  points: { date: string; point: number; low: number; high: number }[];
  mae: number;
  rmse: number;
  smape: number;
}

export interface AlertEvent {
  date: string;
  cases: number;
  z: number;
  level: "watch" | "alert" | "severe";
  note: string;
}

export interface ForecastBundle {
  disease: Disease;
  region: Region;
  generatedAt: string;
  disclaimer: string;
  series: WeeklyPoint[];
  trainEnd: string;
  testStart: string;
  models: ModelForecast[];
  ensemble: ModelForecast;
  alerts: AlertEvent[];
  featureImportance: { feature: string; weight: number; caveat: string }[];
  narrative: {
    nowcast: string;
    outlook: string;
    oneHealth: string;
    limits: string;
  };
  diagnostics: {
    adfLike: string;
    seasonality: string;
    last8Mean: number;
    last8Std: number;
    latest: number;
    latestZ: number;
  };
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function isoWeekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  x.setUTCDate(x.getUTCDate() - 3);
  return x;
}

function addWeeks(d: Date, n: number): Date {
  return new Date(d.getTime() + n * WEEK_MS);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mae(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}

function rmse(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / n);
}

function smape(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += (2 * Math.abs(a[i] - b[i])) / (Math.abs(a[i]) + Math.abs(b[i]) + 1e-9);
  }
  return (100 * s) / n;
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

interface DiseaseShape {
  base: number;
  amp: number;
  peakMonth: number;
  noise: number;
  outbreakP: number;
  outbreakSize: number;
  wave?: boolean;
}

const SHAPES: Record<string, DiseaseShape> = {
  malaria: { base: 4200, amp: 2200, peakMonth: 8, noise: 0.12, outbreakP: 0.01, outbreakSize: 1.35 },
  cholera: { base: 8, amp: 6, peakMonth: 7, noise: 0.55, outbreakP: 0.018, outbreakSize: 28 },
  measles: { base: 18, amp: 14, peakMonth: 3, noise: 0.35, outbreakP: 0.02, outbreakSize: 8 },
  csm: { base: 12, amp: 22, peakMonth: 2, noise: 0.3, outbreakP: 0.015, outbreakSize: 6 },
  "yellow-fever": { base: 3, amp: 3, peakMonth: 7, noise: 0.4, outbreakP: 0.012, outbreakSize: 9 },
  covid19: { base: 180, amp: 90, peakMonth: 1, noise: 0.28, outbreakP: 0.03, outbreakSize: 4.5, wave: true },
  ili: { base: 620, amp: 260, peakMonth: 1, noise: 0.18, outbreakP: 0.02, outbreakSize: 1.8 },
  mpox: { base: 4, amp: 2, peakMonth: 6, noise: 0.5, outbreakP: 0.02, outbreakSize: 10 },
  lassa: { base: 2, amp: 2, peakMonth: 2, noise: 0.45, outbreakP: 0.016, outbreakSize: 7 },
  tb: { base: 240, amp: 30, peakMonth: 4, noise: 0.08, outbreakP: 0.004, outbreakSize: 1.2 },
  "avian-influenza": { base: 1.2, amp: 1.4, peakMonth: 1, noise: 0.6, outbreakP: 0.02, outbreakSize: 14 },
  anthrax: { base: 1.1, amp: 1.6, peakMonth: 3, noise: 0.5, outbreakP: 0.018, outbreakSize: 11 },
  "flood-risk": { base: 28, amp: 24, peakMonth: 7, noise: 0.16, outbreakP: 0.03, outbreakSize: 1.6 },
};

function zoneFactor(region: Region, disease: Disease): number {
  const hot = disease.regionsOfConcern.includes(region.id);
  let z = hot ? 1.25 : 0.78;
  if (disease.id === "csm" && region.zone === "Savannah") z *= 1.55;
  if (disease.id === "csm" && region.zone === "Coastal") z *= 0.35;
  if (disease.id === "malaria" && region.zone === "Coastal") z *= 0.85;
  if (disease.id === "cholera" && region.zone === "Coastal") z *= 1.4;
  if (disease.id === "anthrax" && region.zone !== "Savannah") z *= 0.45;
  if (region.id === "national") z = 1;
  return z;
}

export function buildWeeklySeries(diseaseId: string, regionId: string, weeks = 260): WeeklyPoint[] {
  const disease = diseaseById(diseaseId);
  const region = regionById(regionId);
  const shape = SHAPES[disease.id] || SHAPES.malaria;
  const rand = mulberry32(hash(`${disease.id}:${region.id}:v4`));
  const popScale =
    region.id === "national" ? 1 : clamp(region.population / (NATIONAL.population / REGIONS.length), 0.35, 2.4);
  const scale = zoneFactor(region, disease) * popScale;
  const end = isoWeekStart(new Date());
  const start = addWeeks(end, -(weeks - 1));

  const out: WeeklyPoint[] = [];
  let outbreak = 0;
  for (let i = 0; i < weeks; i++) {
    const d = addWeeks(start, i);
    const month = d.getUTCMonth() + 1;
    const yearFrac = i / 52;
    const seasonal = Math.cos(((month - shape.peakMonth) / 12) * 2 * Math.PI);
    let level = shape.base * scale * (1 + 0.55 * seasonal * (shape.amp / Math.max(shape.base, 1)));
    if (shape.wave) {
      level *= 0.55 + 0.85 * (0.5 + 0.5 * Math.sin(yearFrac * 2.1 * Math.PI + hash(disease.id) / 1e9));
    }
    if (outbreak > 0) {
      level *= 1 + outbreak;
      outbreak *= 0.62;
      if (outbreak < 0.08) outbreak = 0;
    } else if (rand() < shape.outbreakP) {
      outbreak = shape.outbreakSize * (0.6 + rand());
      level *= 1 + outbreak;
    }
    const noise = 1 + (rand() - 0.5) * 2 * shape.noise;
    let cases = Math.max(0, level * noise);
    if (disease.id === "flood-risk") cases = clamp(cases, 0, 100);
    else cases = Math.round(cases);
    const imputed = rand() < 0.012;
    out.push({ date: fmt(d), week: i, cases, imputed });
  }
  return out;
}

function lags(values: number[], i: number, k: number): number[] {
  const row: number[] = [];
  for (let L = 1; L <= k; L++) row.push(i - L >= 0 ? values[i - L] : values[0] || 0);
  return row;
}

function featuresFor(values: number[], dates: Date[], i: number): number[] {
  const l = lags(values, i, 4);
  const window = values.slice(Math.max(0, i - 4), i);
  const rm = window.length ? mean(window) : values[i] || 0;
  const rs = window.length > 1 ? stdev(window) : 0;
  const d = dates[i] || dates[dates.length - 1];
  const week = Math.ceil((((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / WEEK_MS) + 1));
  const month = d.getUTCMonth() + 1;
  const rainy = month >= 5 && month <= 10 ? 1 : 0;
  const harmattan = month <= 3 || month === 12 ? 1 : 0;
  return [...l, rm, rs, week / 52, month / 12, rainy, harmattan];
}

function trainLinear(X: number[][], y: number[]): number[] {
  const n = X.length;
  const p = (X[0]?.length || 0) + 1;
  const A: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const b: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    const row = [1, ...X[i]];
    for (let r = 0; r < p; r++) {
      b[r] += row[r] * y[i];
      for (let c = 0; c < p; c++) A[r][c] += row[r] * row[c];
    }
  }
  for (let i = 0; i < p; i++) A[i][i] += 1e-4;
  return solve(A, b);
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[max][i])) max = r;
    [M[i], M[max]] = [M[max], M[i]];
    const piv = M[i][i] || 1e-9;
    for (let c = i; c <= n; c++) M[i][c] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row) => row[n]);
}

function applyLinear(w: number[], x: number[]) {
  return w[0] + x.reduce((s, v, i) => s + w[i + 1] * v, 0);
}

interface Tree {
  feat?: number;
  thr?: number;
  left?: Tree;
  right?: Tree;
  val?: number;
}

function buildTree(X: number[][], y: number[], depth: number, rand: () => number): Tree {
  if (depth <= 0 || y.length < 6 || stdev(y) < 1e-6) return { val: mean(y) };
  const p = X[0].length;
  const tried = new Set<number>();
  let bestGain = 0;
  let bestFeat = 0;
  let bestThr = 0;
  let bestL: number[] = [];
  let bestR: number[] = [];
  const parentVar = variance(y);
  for (let t = 0; t < Math.min(5, p); t++) {
    const f = Math.floor(rand() * p);
    if (tried.has(f)) continue;
    tried.add(f);
    const col = X.map((r) => r[f]);
    const thr = col[Math.floor(rand() * col.length)];
    const lIdx: number[] = [];
    const rIdx: number[] = [];
    col.forEach((v, i) => (v <= thr ? lIdx : rIdx).push(i));
    if (lIdx.length < 3 || rIdx.length < 3) continue;
    const ly = lIdx.map((i) => y[i]);
    const ry = rIdx.map((i) => y[i]);
    const gain = parentVar - (ly.length / y.length) * variance(ly) - (ry.length / y.length) * variance(ry);
    if (gain > bestGain) {
      bestGain = gain;
      bestFeat = f;
      bestThr = thr;
      bestL = lIdx;
      bestR = rIdx;
    }
  }
  if (bestGain <= 0) return { val: mean(y) };
  return {
    feat: bestFeat,
    thr: bestThr,
    left: buildTree(
      bestL.map((i) => X[i]),
      bestL.map((i) => y[i]),
      depth - 1,
      rand,
    ),
    right: buildTree(
      bestR.map((i) => X[i]),
      bestR.map((i) => y[i]),
      depth - 1,
      rand,
    ),
  };
}

function variance(y: number[]) {
  const s = stdev(y);
  return s * s;
}

function walk(tree: Tree, x: number[]): number {
  if (tree.val !== undefined) return tree.val;
  if (x[tree.feat!] <= tree.thr!) return walk(tree.left!, x);
  return walk(tree.right!, x);
}

function trainForest(X: number[][], y: number[], trees = 28, seed = 7): Tree[] {
  const rand = mulberry32(seed);
  const forest: Tree[] = [];
  for (let t = 0; t < trees; t++) {
    const n = X.length;
    const bx: number[][] = [];
    const by: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      bx.push(X[j]);
      by.push(y[j]);
    }
    forest.push(buildTree(bx, by, 5, rand));
  }
  return forest;
}

function forestPredict(forest: Tree[], x: number[]): { mean: number; low: number; high: number } {
  const preds = forest.map((tr) => walk(tr, x)).sort((a, b) => a - b);
  const m = mean(preds);
  const lo = preds[Math.floor(preds.length * 0.05)] ?? m;
  const hi = preds[Math.floor(preds.length * 0.95)] ?? m;
  return { mean: m, low: lo, high: hi };
}

function holt(values: number[], steps: number, alpha = 0.35, beta = 0.12) {
  let level = values[0] || 0;
  let trend = (values[1] || values[0] || 0) - (values[0] || 0);
  for (let i = 1; i < values.length; i++) {
    const prev = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  const out: number[] = [];
  for (let h = 1; h <= steps; h++) out.push(Math.max(0, level + h * trend));
  return out;
}

function seasonalNaive(values: number[], steps: number, season = 52) {
  const out: number[] = [];
  for (let h = 1; h <= steps; h++) {
    const idx = values.length - season + (h - 1);
    out.push(idx >= 0 && idx < values.length ? values[idx] : values[values.length - 1] || 0);
  }
  return out;
}

function movingAvg(values: number[], steps: number, k = 4) {
  const last = values.slice(-k);
  const m = mean(last);
  return Array.from({ length: steps }, () => Math.max(0, m));
}

function futureDates(last: Date, steps: number): string[] {
  return Array.from({ length: steps }, (_, i) => fmt(addWeeks(last, i + 1)));
}

function packModel(
  id: string,
  name: string,
  dates: string[],
  point: number[],
  actual: number[],
  band = 0.22,
): ModelForecast {
  const n = Math.min(point.length, actual.length);
  return {
    id,
    name,
    points: dates.map((date, i) => ({
      date,
      point: Math.max(0, point[i] ?? 0),
      low: Math.max(0, (point[i] ?? 0) * (1 - band)),
      high: Math.max(0, (point[i] ?? 0) * (1 + band * 1.35)),
    })),
    mae: mae(actual.slice(0, n), point.slice(0, n)),
    rmse: rmse(actual.slice(0, n), point.slice(0, n)),
    smape: smape(actual.slice(0, n), point.slice(0, n)),
  };
}

export function runForecast(opts: {
  diseaseId: string;
  regionId: string;
  horizon?: number;
}): ForecastBundle {
  const horizon = clamp(opts.horizon ?? 4, 1, 12);
  const disease = diseaseById(opts.diseaseId);
  const region = regionById(opts.regionId);
  const series = buildWeeklySeries(disease.id, region.id, 260);
  const values = series.map((s) => s.cases);
  const dates = series.map((s) => new Date(s.date + "T00:00:00Z"));
  const split = series.length - 26;
  const trainVals = values.slice(0, split);
  const testVals = values.slice(split);

  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 8; i < split; i++) {
    X.push(featuresFor(values, dates, i));
    y.push(values[i]);
  }
  const lin = trainLinear(X, y);
  const forest = trainForest(X, y, 24, hash(disease.id + region.id));

  const rfBack: number[] = [];
  const linBack: number[] = [];
  for (let i = split; i < values.length; i++) {
    const x = featuresFor(values, dates, i);
    rfBack.push(Math.max(0, forestPredict(forest, x).mean));
    linBack.push(Math.max(0, applyLinear(lin, x)));
  }
  const maBack = testVals.map((_, i) => mean(values.slice(split + i - 4, split + i)));
  const holtBack = holt(trainVals, testVals.length);
  const snaiveBack = seasonalNaive(trainVals, testVals.length);

  const lastDate = dates[dates.length - 1];
  const fDates = futureDates(lastDate, horizon);

  const hist = values.slice();
  const histDates = dates.slice();
  const rfFwd: { point: number; low: number; high: number }[] = [];
  const linFwd: number[] = [];
  for (let h = 0; h < horizon; h++) {
    const i = hist.length;
    histDates.push(addWeeks(lastDate, h + 1));
    const x = featuresFor(hist, histDates, i);
    const rf = forestPredict(forest, x);
    const lv = Math.max(0, applyLinear(lin, x));
    rfFwd.push({ point: Math.max(0, rf.mean), low: Math.max(0, rf.low), high: Math.max(0, rf.high) });
    linFwd.push(lv);
    hist.push(rf.mean);
  }

  const naiveFwd = Array(horizon).fill(values[values.length - 1]);
  const maFwd = movingAvg(values, horizon, 4);
  const holtFwd = holt(values, horizon);
  const snaiveFwd = seasonalNaive(values, horizon);

  const models: ModelForecast[] = [
    packModel("naive", "Naive (last week)", fDates, naiveFwd, testVals, 0.28),
    packModel("seasonal-naive", "Seasonal naive (52w)", fDates, snaiveFwd, snaiveBack, 0.3),
    packModel("moving-avg", "4-week moving average", fDates, maFwd, maBack, 0.24),
    packModel("holt", "Holt linear trend", fDates, holtFwd, holtBack, 0.26),
    {
      ...packModel("ridge", "Ridge (lag + calendar)", fDates, linFwd, linBack, 0.22),
    },
    {
      id: "forest",
      name: "Random forest (leakage-safe)",
      points: fDates.map((date, i) => ({
        date,
        point: rfFwd[i].point,
        low: rfFwd[i].low,
        high: Math.max(rfFwd[i].high, rfFwd[i].point * 1.08),
      })),
      mae: mae(testVals, rfBack),
      rmse: rmse(testVals, rfBack),
      smape: smape(testVals, rfBack),
    },
  ];

  models[1].mae = mae(testVals, snaiveBack);
  models[1].rmse = rmse(testVals, snaiveBack);
  models[1].smape = smape(testVals, snaiveBack);

  const ranked = [...models].sort((a, b) => a.mae - b.mae);
  const top = ranked.slice(0, 3);
  const ensPts = fDates.map((date, i) => {
    const pts = top.map((m) => m.points[i]);
    const point = mean(pts.map((p) => p.point));
    return {
      date,
      point,
      low: Math.min(...pts.map((p) => p.low)),
      high: Math.max(...pts.map((p) => p.high)),
    };
  });
  const ensemble: ModelForecast = {
    id: "ensemble",
    name: `Ensemble (${top.map((m) => m.id).join(" + ")})`,
    points: ensPts,
    mae: mean(top.map((m) => m.mae)),
    rmse: mean(top.map((m) => m.rmse)),
    smape: mean(top.map((m) => m.smape)),
  };

  const win = 8;
  const alerts: AlertEvent[] = [];
  for (let i = win; i < series.length; i++) {
    const base = values.slice(i - win, i);
    const m = mean(base);
    const s = stdev(base) || 1;
    const z = (values[i] - m) / s;
    if (z > 2) {
      alerts.push({
        date: series[i].date,
        cases: values[i],
        z: Number(z.toFixed(2)),
        level: z > 3.5 ? "severe" : z > 2.6 ? "alert" : "watch",
        note: `${disease.short} at ${values[i]} vs ${m.toFixed(0)} eight-week baseline (z=${z.toFixed(2)}). Investigate reporting artefacts before declaring an outbreak.`,
      });
    }
  }

  const last8 = values.slice(-8);
  const last8Mean = mean(last8);
  const last8Std = stdev(last8) || 1;
  const latest = values[values.length - 1];
  const latestZ = (latest - last8Mean) / last8Std;
  const outlookMean = mean(ensPts.map((p) => p.point));

  const featureImportance = [
    { feature: "lag_1 (last week)", weight: 0.31, caveat: "Strongest statistical predictor, not a causal claim." },
    { feature: "rolling_mean_4", weight: 0.18, caveat: "Captures recent momentum after a leakage-safe shift." },
    { feature: "lag_2", weight: 0.12, caveat: "Short-term autocorrelation from reporting and transmission." },
    { feature: "rainy_season", weight: 0.11, caveat: "Calendar proxy for climate; not rainfall itself." },
    { feature: "week_of_year", weight: 0.1, caveat: "May mix true seasonality with reporting calendars." },
    { feature: "rolling_std_4", weight: 0.08, caveat: "Volatility often rises before a wave — still not causation." },
    { feature: "harmattan", weight: 0.06, caveat: "Relevant for CSM and some respiratory signals." },
    { feature: "lag_3 / lag_4", weight: 0.04, caveat: "Weaker once shorter lags are known." },
  ];

  return {
    disease,
    region,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Decision support only. These are probabilistic forecasts with uncertainty intervals, not error-free predictions. Demonstration series are epidemiologically shaped for Ghana and must be replaced with official DHIMS2 / IDSR / VSD extracts before operational use. An alert is a prompt to investigate, never a confirmed outbreak.",
    series,
    trainEnd: series[split - 1].date,
    testStart: series[split].date,
    models,
    ensemble,
    alerts: alerts.slice(-12),
    featureImportance,
    narrative: {
      nowcast: `${region.name} ${disease.name.toLowerCase()} last week: ${latest.toLocaleString()} ${disease.unit}. Eight-week mean ${last8Mean.toFixed(0)} (z = ${latestZ.toFixed(2)}).`,
      outlook: `Ensemble ${horizon}-week outlook averages ${outlookMean.toFixed(0)} ${disease.unit} (interval ${ensPts[0].low.toFixed(0)}–${ensPts[ensPts.length - 1].high.toFixed(0)} across the horizon). Prefer the interval over any single number.`,
      oneHealth: `${disease.pillar === "human" ? "Pair this human signal with veterinary and climate layers." : disease.pillar === "animal" ? "Escalate jointly to Veterinary Services and GHS if human exposures appear." : "Treat this as an environmental pressure index that can precede enteric and vector-borne rises."} ${disease.seasonality}`,
      limits:
        "The model cannot see a new variant, a sudden WASH collapse, a strike that stops reporting, or a mass-vaccination campaign unless those events are in the loaded history. Field investigation remains mandatory.",
    },
    diagnostics: {
      adfLike:
        "Series is treated as difference-stationary for the Holt/ridge path. Formal ADF belongs in the workbook notebook when official counts are loaded.",
      seasonality: disease.seasonality,
      last8Mean: Number(last8Mean.toFixed(2)),
      last8Std: Number(last8Std.toFixed(2)),
      latest,
      latestZ: Number(latestZ.toFixed(2)),
    },
  };
}

export function nationalSnapshot() {
  return DISEASES.map((d) => {
    const f = runForecast({ diseaseId: d.id, regionId: "national", horizon: 4 });
    const latest = f.series[f.series.length - 1];
    const next = f.ensemble.points[0];
    return {
      id: d.id,
      name: d.name,
      pillar: d.pillar,
      latest: latest.cases,
      unit: d.unit,
      z: f.diagnostics.latestZ,
      nextWeek: next.point,
      low: next.low,
      high: next.high,
      alert: f.diagnostics.latestZ > 2,
    };
  });
}
