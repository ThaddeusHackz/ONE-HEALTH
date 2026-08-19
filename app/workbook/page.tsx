import { Disclaimer } from "@/components/Disclaimer";

export const metadata = { title: "Modified Phase 2 workbook" };

const MODULES = [
  {
    n: "0",
    title: "What the professor asked us to change",
    body: "The original Phase 2 workbook taught a single-country COVID series in Colab with Gemini as tutor. The production brief is different: Ghana Health Service only; many diseases; documents and photographs as first-class inputs; OpenRouter multi-model fallback; voice; web search; a white national UI; and a path onto Render. This page is the modified workbook — every original scientific rule is kept, and every new system behaviour is explained.",
  },
  {
    n: "1",
    title: "One Health, for Ghana",
    img: "/images/one-health-convergence.png",
    body: "Human (GHS / IDSR / DHIMS2), animal (Veterinary Services), and environment (EPA, GMet, NADMO) converge on one desk. Ebola, HPAI, anthrax, Lassa and cholera are not “human-only” problems in Ghana. Forecasting without the other two pillars will systematically miss the first signal.",
  },
  {
    n: "2",
    title: "Problem framing (replaced)",
    body: "Original: “weekly COVID-19 cases in one country, 4 weeks ahead.” Ghana production: target = weekly reported (or suspected) counts for a named notifiable disease; unit = Ghana region-week; horizon = 4 weeks default (2–12 allowed); predictors = leakage-safe lags, rolling mean/std, calendar, rainy-season and harmattan flags; success = beat a naive baseline on a chronological test set, with an interval, not a point.",
  },
  {
    n: "3",
    title: "Environment: Colab remains, production is this site",
    img: "/images/system-architecture.png",
    body: "Keep the companion notebook for teaching. The operational system is this Next.js app: statistical engine in TypeScript, intelligence via OpenRouter, files via Vision Lab. Runtime rule is the same as Colab — nothing secret lives in the browser. Keys are server environment variables.",
  },
  {
    n: "4–5",
    title: "Ingest and clean — now including pictures",
    img: "/images/vision-ingest.png",
    body: "Official path: DHIMS2 / IDSR CSV with date, region, disease, new_cases. Alternate path: a photographed line-list, a stamped lab slip, a handwritten CHPS tally. Vision models extract fields and must refuse to echo identifiers. Cleaning rules are unchanged: clip negative corrections to 0; resample weekly; interpolate at most 2 internal weeks; flag the rest. Never delete a spike because it looks ugly — it may be the outbreak.",
  },
  {
    n: "6–7",
    title: "EDA and time-series diagnostics",
    body: "Plot raw weekly counts and a 4-week rolling mean. Ask whether a peak is a wave or a backlog dump. Decomposition (trend / seasonal / residual), a stationarity check, and ACF/PACF still decide which lags are honest features. Harmattan (CSM) and major rains (malaria, cholera) are Ghana’s two seasonal clocks.",
  },
  {
    n: "8–9",
    title: "Baselines first, then a chronological split",
    img: "/images/chrono-split.png",
    body: "Naive, seasonal naive (52 weeks), moving average. If the forest cannot beat last week, it does not get to brief the Minister. Random train/test split is forbidden — that is temporal leakage. Training ends before validation; validation ends before test. Walk-forward is the robust upgrade.",
  },
  {
    n: "10–12",
    title: "Features and models",
    img: "/images/feature-pipeline.png",
    body: "lag_1..4, rolling_mean_4 and rolling_std_4 computed after shift(1), week-of-year, month, rainy, harmattan. Models on the desk: naive family, Holt linear, ridge on those features, a small random forest, then an ensemble of the three lowest MAE. SARIMA remains in the Python notebook for teaching native prediction intervals. Deep nets are still not justified on a few hundred weekly points.",
  },
  {
    n: "13–14",
    title: "Evaluation and uncertainty",
    body: "MAE, RMSE, sMAPE on the held-out window. sMAPE exists because cholera and yellow fever sit near zero most weeks — MAPE explodes. A forecast is printed as 127 (90% interval 105–151), never 127. Tree percentiles approximate forest intervals; they are not a full posterior.",
  },
  {
    n: "15",
    title: "Early warning is not confirmation",
    img: "/images/early-warning.png",
    body: "z > 2 against an 8-week baseline raises a watch. z > 3.5 is severe. The next human action is: check a reporting outage, a batch dump, a laboratory backlog, then decide whether to mobilise. The model is not the incident manager.",
  },
  {
    n: "16–19",
    title: "Interpretation, AI limits, ethics",
    body: "Feature importance is not causation. OpenRouter (or Gemini in class) may draft code and briefings. It must never decide that an outbreak exists, that a point is an error, or that an intervention should launch. Never paste a patient name, folder number, phone, or small-cell paediatric count into the model. Aggregates only.",
  },
  {
    n: "20",
    title: "Capstone → this platform",
    body: "The original capstone is now the acceptance test of ONE HEALTH GHANA: framed Ghana problem, ingested public or official extract, cleaned with a log, two models plus baseline, intervals, z-alerts, feature caveats, AI-assistance log, and a one-page limit statement. The site is the live demonstration; the notebook is the reproducible proof.",
  },
];

export default function WorkbookPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">Phase 2 · modified</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Workbook for the system we are building</h1>
      <p className="mt-4 leading-7 text-muted">
        Original title: <i>ONE HEALTH PANDEMIC AND DISEASE OUTBREAK FORECASTING — Phase 2</i>. Professor direction: modify it so the class can walk into a working Ghana Health Service system. Forensic findings and the OpenRouter fallback design are in the repository docs.
      </p>
      <a href="/ONE_HEALTH_GHANA_Phase2_Illustrated_Workbook.pdf" className="mt-4 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
        Download the illustrated Ghana workbook (PDF)
      </a>
      <div className="mt-5">
        <Disclaimer />
      </div>
      <div className="mt-10 space-y-12">
        {MODULES.map((m) => (
          <article key={m.n}>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal">Module {m.n}</div>
            <h2 className="font-display mt-1 text-3xl">{m.title}</h2>
            <p className="mt-3 leading-7">{m.body}</p>
            {"img" in m && m.img && (
              <img src={m.img} alt="" className="mt-5 w-full rounded-3xl border border-line bg-white shadow-card" />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
