import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";

export const metadata = { title: "National systems workbook" };

const TOC: [string, string][] = [
  ["00", "How this project was made successful"],
  ["01", "Why the Phase 2 workbook exists"],
  ["02", "The Ghana One Health contract"],
  ["03", "What we built — eleven rooms"],
  ["04", "Repository map — every file that ships"],
  ["05", "Data that may enter the system"],
  ["06", "The statistical engine, as built"],
  ["07", "Early warning is not confirmation"],
  ["08", "OpenRouter — one key, groups of three"],
  ["09", "The other keys: Tavily, OpenWeather, ElevenLabs"],
  ["10", "Vision Lab — any file GHS can hold"],
  ["11", "Intelligence, voice, search"],
  ["12", "Extracts, nowcast, field cards"],
  ["13", "Climate as a pillar, not decoration"],
  ["14", "Regions, districts, small cells"],
  ["15", "Admin, CMS, audit, archive"],
  ["16", "Hosting on Render — what actually boots"],
  ["17", "Forensic findings that changed the code"],
  ["18", "Ethics and what we refuse"],
  ["19", "Acceptance test for the class"],
  ["20", "A Monday morning on the desk"],
];

const DESKS = [
  { href: "/", name: "Home", job: "National briefing surface. Pillars, signals, honest limits, Ghana flag bar." },
  { href: "/forecast", name: "Forecast desk", job: "Leakage-safe ensemble, 2–12 week horizon, interval not a point, official CSV overlay, delay nowcast, AI briefing." },
  { href: "/surveillance", name: "Surveillance board", job: "All 13 signals, latest count, z-score, next-week interval. Watch vs investigate." },
  { href: "/climate", name: "Climate desk", job: "Parallel OpenWeather watch-cities plus a sitrep that may mix weather, search, and the ensemble." },
  { href: "/intelligence", name: "Intelligence", job: "Ghana-locked chat, web search, voice in/out, language, live ensemble attached to the prompt." },
  { href: "/vision", name: "Vision Lab", job: "PDF, Word, Excel, CSV, photos. Local text extract + multi-model vision. Redaction first." },
  { href: "/extracts", name: "Extracts", job: "DHIMS2 / IDSR weekly CSV. Quality log, completeness, OpenRouter review, then the forecast uses that series." },
  { href: "/field", name: "Field brief", job: "Ninety-word CHPS card in English, Twi, Ewe, Ga or Hausa. Speak it." },
  { href: "/regions", name: "Regions", job: "Sixteen official regions plus representative MMDAs. Unit of analysis is region-week." },
  { href: "/workbook", name: "This workbook", job: "The modified Phase 2 teaching contract and the build log of every system." },
];

const FILES: [string, string][] = [
  ["lib/forecast.ts", "Weekly generator, lags, ridge, forest, Holt, ensemble, z / CUSUM, national snapshot."],
  ["lib/openrouter.ts", "One key. Groups of three models. Paid → free → openrouter/auto. Vision chain."],
  ["lib/env.ts", "Reads every plausible secret name. Never ships a key to the browser."],
  ["lib/dhims2.ts", "CSV / TSV / semicolon parser, quality log, completeness, negatives clipped."],
  ["lib/nowcast.ts", "Reporting-delay completeness curve. Interval, not a secret true count."],
  ["lib/analyze.ts + lib/files.ts", "Local extract of PDF / Office / CSV / images, then vision."],
  ["lib/redact.ts", "Names, phones, Ghana folder numbers stripped before any model sees text."],
  ["lib/search.ts", "Tavily if present, else DuckDuckGo HTML, Ghana-weighted domains."],
  ["lib/weather.ts", "Ten watch-cities in parallel against OpenWeather."],
  ["lib/store.ts + lib/pg-store.ts", "db.json plus optional Postgres snapshot so free-web sleep does not wipe history."],
  ["lib/archive.ts + lib/sign.ts", "Append-only events.jsonl and HMAC-SHA256 signed audit export."],
  ["lib/cms.ts", "Default copy, Ghana flag colours, nav, knowledge cards."],
  ["lib/ghana.ts", "Sixteen regions, thirteen signals, the Ghana-locked system prompt."],
  ["app/api/*", "Route handlers only. Secrets stay on the server."],
  ["notebooks/ghana_one_health_forecasting.py", "Reproducible classroom proof. SARIMA stays here."],
  ["workbook/build_workbook_pdf.py", "Illustrated PDF generator (figures 1–9 are real pictures)."],
];

const SIGNALS = [
  ["Malaria", "Human · vector", "Highest burden. Rains, standing water, forest and savannah."],
  ["Cholera", "Human · WASH", "Coastal density + flood. Quiet baselines, explosive spikes."],
  ["Measles", "Human · VPD", "Immunity gaps. Delayed SIA or displacement."],
  ["CSM", "Human · belt", "Harmattan dust, crowding, northern savannah."],
  ["Yellow fever", "Human · arbo", "Sylvatic / urban. Forest edge, coverage gaps."],
  ["COVID-19", "Human · resp", "Endemic teaching series for chronological splits."],
  ["ILI", "Human · sentinel", "Practical early window on respiratory viruses."],
  ["Mpox", "Human · zoo", "Market–household interface."],
  ["Lassa", "Human · zoo", "Mastomys, harvest stores, dry-season intrusion."],
  ["TB", "Human · chronic", "Load signal, not an outbreak spike."],
  ["Avian influenza", "Animal", "Live-bird markets, backyard flocks."],
  ["Anthrax", "Animal", "Carcass + butchering. Joint VSD / GHS."],
  ["Flood-linked risk", "Environment", "Pressure index that can precede enteric and malaria rises."],
];

const MODELS = [
  ["Naive", "Last observed week, walk-forward on the hold-out. The minister’s cheapest rival."],
  ["Seasonal naive", "Same week last year (lag 52). Ghana’s two clocks: rains and harmattan."],
  ["4-week MA", "Recent momentum. Smooths noise, lags a true turn."],
  ["Holt linear", "Level + trend, fitted on train only. Dangerous if you let it run forever."],
  ["Ridge", "lag_1–4, rolling mean/std (shifted), week, month, rainy, harmattan. Closed-form."],
  ["Random forest", "Same features, leakage-safe split. Percentile band, not a posterior."],
  ["Ensemble", "Three lowest MAE on the chronological hold-out. Ships only if it earns it."],
];

const KEYS = [
  ["OPENROUTER_API_KEY", "Chat, vision, briefing, extract review, field card. One key. Groups of three + :free + openrouter/auto."],
  ["TAVILY_API_KEY", "Cited search. Without it the desk uses DuckDuckGo HTML."],
  ["ELEVENLABS_API_KEY", "Studio voice. Restricted keys cannot hit /v1/user; the desk probes /v1/voices and still speaks."],
  ["OPENWEATHER_API_KEY", "Live Accra, Kumasi, Tamale… Without it, climatic placeholders, labelled as such."],
  ["ADMIN_* / SESSION_SECRET", "CMS, colours, nav, knowledge, signed audit."],
  ["DATABASE_URL", "Optional Postgres so history survives free-web sleep."],
];

const BUILD = [
  ["1. Forensic the PDF", "The Phase 2 workbook was a 26-page Word export. Figures 1–6 were captions without pictures. The science inside it was sound."],
  ["2. Repair the companion code", "code.txt was South Africa, had a syntax error in alerts, deprecated fillna, SARIMA fit on the full series, and a leaky RF merge."],
  ["3. Retarget Ghana", "Sixteen official regions. Thirteen One Health signals. Unit of analysis = region-week."],
  ["4. Build the statistical desk", "TypeScript engine so the website does not need Python at runtime. Notebook remains the proof."],
  ["5. Wire one OpenRouter key", "Cross-provider fallback. Then the live 400 taught us: at most three slugs per request."],
  ["6. Make files first-class", "Vision Lab reads what a district office actually holds: scans, memos, Excel, photos."],
  ["7. Give climate a desk", "OpenWeather is the environmental pillar, not a widget."],
  ["8. Speak the field card", "Ninety words. Five languages. ElevenLabs or the device voice."],
  ["9. Hide nothing", "Intervals. z-scores. Demonstration vs official. Free Render sleeps. Keys stay on the server."],
  ["10. Ship on Render", "One Node web service, /api/health, secrets in Environment, optional Postgres."],
];

export default function WorkbookPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">
        Phase 2 · modified · Ghana Health Service · systems edition
      </p>
      <h1 className="font-display mt-2 text-4xl tracking-tight md:text-6xl">
        The systems workbook — how every part of ONE HEALTH GHANA was made
      </h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
        Original title: <i>ONE HEALTH PANDEMIC AND DISEASE OUTBREAK FORECASTING — Phase 2</i>.
        The class notebook taught a single COVID series in Colab. The production brief is a
        national desk: sixteen regions, thirteen One Health signals, files and photographs,
        one OpenRouter key with a real fallback chain, voice, climate, extracts, and an honest
        interval. This page is that brief <em>and</em> the build log — written so a district
        director and a software examiner can both finish it.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="/ONE_HEALTH_GHANA_Phase2_Illustrated_Workbook.pdf"
          className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
        >
          Download illustrated PDF
        </a>
        <Link href="/forecast" className="inline-flex rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold">
          Open the forecast desk
        </Link>
        <Link href="/admin/login" className="inline-flex rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold">
          Admin / API probe
        </Link>
      </div>

      <div className="mt-5">
        <Disclaimer />
      </div>

      <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["16", "official regions"],
          ["13", "priority signals"],
          ["11", "rooms (10 public + admin)"],
          ["7", "forecast families"],
          ["4 wks", "default horizon"],
          ["z > 2", "investigation watch"],
          ["3", "models per OpenRouter call"],
          ["0", "patient identifiers"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-3xl border border-line bg-white p-5 shadow-card">
            <div className="font-display text-3xl">{n}</div>
            <div className="mt-1 text-sm text-muted">{l}</div>
          </div>
        ))}
      </section>

      <nav className="mt-10 rounded-[28px] border border-line bg-white p-6 shadow-card">
        <h2 className="font-display text-2xl">Contents — twenty-one modules</h2>
        <p className="mt-2 text-sm text-muted">
          The original PDF had Modules 1–20 plus empty figure boxes. This edition keeps the
          scientific contract and adds the production systems that made the project succeed.
        </p>
        <ol className="mt-4 grid gap-2 md:grid-cols-2">
          {TOC.map(([n, t]) => (
            <li key={n}>
              <a href={`#m${n}`} className="text-sm text-ghana-green hover:underline">
                <span className="mr-2 font-semibold text-muted">{n}</span>
                {t}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article id="m00" className="mt-16">
        <Eyebrow n="00" />
        <h2 className="font-display text-4xl tracking-tight">How this project was made successful</h2>
        <p className="mt-4 leading-8">
          Success here does not mean “the model is never wrong.” That sentence is scientifically
          false and was rejected in the first forensic pass. Success means: a Ghana officer can
          open a white national desk, load a weekly extract, see an interval, ask a model that
          actually answers, and still know what the machine is not allowed to claim.
        </p>
        <div className="mt-6 space-y-3">
          {BUILD.map(([title, body], i) => (
            <div key={title} className="rounded-3xl border border-line bg-white p-5 shadow-card">
              <div className="text-xs font-semibold uppercase tracking-wider text-teal">Step {i + 1}</div>
              <div className="mt-1 font-semibold">{title}</div>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 leading-8">
          The live host is <code>one-health-ghana.onrender.com</code>. Secrets live only in
          Render → Environment. The browser never receives a key.{" "}
          <Link href="/api/health" className="text-ghana-green underline">/api/health</Link> is
          the public heartbeat; Admin → API desk is the private probe.
        </p>
      </article>

      <article id="m01" className="mt-16">
        <Eyebrow n="01" />
        <h2 className="font-display text-4xl tracking-tight">Why the Phase 2 workbook exists</h2>
        <p className="mt-4 leading-8">
          The Phase 2 PDF was a teaching artefact: Colab, Gemini as tutor, one country, COVID
          weekly counts, figures that were captions without pictures. The scientific contract
          inside it was sound and is kept:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-7">
          <li>UNDERSTAND → IMPLEMENT → VALIDATE → USE AI TO ASSIST → CRITICALLY EVALUATE → IMPROVE → INTERPRET.</li>
          <li>Chronological splits. Random train/test is temporal leakage.</li>
          <li>Leakage-safe lags and rolling windows (always <code>shift(1)</code>).</li>
          <li>Baselines before machine learning. If a forest cannot beat last week, it does not brief the Minister.</li>
          <li>Intervals, not points. Write <code>127 (105–151)</code>, never 127.</li>
          <li>Alerts are not outbreaks. The model is not the analyst of record.</li>
          <li>No patient identifiers, ever.</li>
        </ul>
        <p className="mt-4 leading-8">
          The professor’s modification is operational. Walk out of class into a Ghana Health
          Service system. That means: Ghana only; many diseases; documents and photographs as
          first-class inputs; one OpenRouter key with a real fallback chain; spoken field cards;
          web search; climate as a pillar; a white national UI; and a path onto Render with
          secrets that never touch the browser.
        </p>
        <img src="/images/data-decision-pipeline.png" alt="Data to decision pipeline" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <p className="mt-3 text-center text-sm text-muted">Figure 1. Data → analysis → model → forecast → decision support. Every arrow can introduce error.</p>
      </article>

      <article id="m02" className="mt-16">
        <Eyebrow n="02" />
        <h2 className="font-display text-4xl tracking-tight">The Ghana One Health contract</h2>
        <img src="/images/one-health-convergence.png" alt="One Health convergence" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <p className="mt-3 text-center text-sm text-muted">Figure 2. Human, animal and environmental streams share one Ghana desk.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Pill title="Human" tone="bg-green-soft" body="GHS / IDSR / DHIMS2. Notifiable diseases, ILI, facility load. Weekly aggregates only." />
          <Pill title="Animal" tone="bg-gold-soft" body="Veterinary Services. HPAI flocks, anthrax carcasses, abortive events. Joint escalation if humans are exposed." />
          <Pill title="Environment" tone="bg-teal-soft" body="EPA / GMet / NADMO / OpenWeather. Flood index, rainfall, heat, harmattan dust." />
        </div>
        <p className="mt-6 leading-8">
          Ebola, HPAI, anthrax, Lassa and cholera are not “human-only” problems in Ghana. A malaria
          forecast that never looks at standing water, or a cholera watch that never looks at Odaw
          flooding, will systematically miss the first signal. The production unit of analysis is a
          <strong> Ghana region-week</strong>. National roll-up is the default; Greater Accra cholera
          or Upper East CSM is one click away.
        </p>
        <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-muted">
              <tr>
                <th className="px-4 py-3">Signal</th>
                <th>Family</th>
                <th>Why it is on the desk</th>
              </tr>
            </thead>
            <tbody>
              {SIGNALS.map(([n, f, w]) => (
                <tr key={n} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">{n}</td>
                  <td className="text-muted">{f}</td>
                  <td className="pr-4 py-3 text-muted">{w}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article id="m03" className="mt-16">
        <Eyebrow n="03" />
        <h2 className="font-display text-4xl tracking-tight">What we built — eleven rooms</h2>
        <img src="/images/system-architecture.png" alt="System architecture" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <p className="mt-3 text-center text-sm text-muted">Figure 3. Artefacts in, leakage-safe models, OpenRouter fallback, Ghana command UI.</p>
        <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-muted">
              <tr>
                <th className="px-4 py-3">Desk</th>
                <th>What it is for</th>
              </tr>
            </thead>
            <tbody>
              {DESKS.map((d) => (
                <tr key={d.href} className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">
                    <Link href={d.href} className="text-ghana-green hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="pr-4 py-3 text-muted">{d.job}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted">
          Admin (<code>/admin</code>) is the eleventh room: CMS copy, Ghana flag colours, nav visibility,
          knowledge cards, document/chat/forecast records, API probe, signed HMAC audit.
        </p>
      </article>

      <article id="m04" className="mt-16">
        <Eyebrow n="04" />
        <h2 className="font-display text-4xl tracking-tight">Repository map — every file that ships</h2>
        <p className="mt-4 leading-8">
          The production app is Next.js 15 (App Router) + TypeScript + Tailwind. There is no
          separate frontend and backend. Python exists only for the classroom notebook and the
          illustrated PDF builder.
        </p>
        <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-muted">
              <tr>
                <th className="px-4 py-3">Path</th>
                <th>Why it exists</th>
              </tr>
            </thead>
            <tbody>
              {FILES.map(([p, w]) => (
                <tr key={p} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs">{p}</td>
                  <td className="py-3 pr-4 text-muted">{w}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article id="m05" className="mt-16">
        <Eyebrow n="05" />
        <h2 className="font-display text-4xl tracking-tight">Data that may enter the system</h2>
        <img src="/images/vision-ingest.png" alt="Ingest" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <p className="mt-3 text-center text-sm text-muted">Figure 4. Field photos, IDSR forms, lab slips and CSVs enter the same extraction step.</p>
        <ul className="mt-6 space-y-3 leading-7">
          <li><strong>Official weekly extract.</strong> DHIMS2 / IDSR CSV: week-ending or date + cases. Semicolon and tab accepted. Quality log records missing weeks, duplicates, negatives clipped, completeness.</li>
          <li><strong>Demonstration series.</strong> Epidemiologically shaped Ghana histories so the desk teaches before an official file arrives. Never pretend they are DHIMS2. The source badge on the forecast desk says <code>demonstration</code> or <code>official</code>.</li>
          <li><strong>Documents and photographs.</strong> Circulars, Word memos, Excel line lists, lab slips, CHPS tallies. Text layers are read locally. Images and PDFs go through the vision chain. Names, phones, folder numbers are redacted first.</li>
          <li><strong>Climate.</strong> OpenWeather for watch-cities. Placeholder rows if the key is absent — labelled as such.</li>
          <li><strong>Web.</strong> Tavily if present, else DuckDuckGo, weighted toward GHS, WHO, NADMO, Noguchi.</li>
        </ul>
        <p className="mt-4 leading-8">
          Cleaning rules from the original workbook are unchanged: clip negative corrections to 0;
          resample weekly; interpolate at most two internal weeks; flag the rest. Never delete a
          spike because it looks ugly — it may be the outbreak.
        </p>
      </article>

      <article id="m06" className="mt-16">
        <Eyebrow n="06" />
        <h2 className="font-display text-4xl tracking-tight">The statistical engine, as built</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <img src="/images/chrono-split.png" alt="Chronological split" className="w-full rounded-[28px] border border-line bg-white shadow-card" />
          <img src="/images/feature-pipeline.png" alt="Feature pipeline" className="w-full rounded-[28px] border border-line bg-white shadow-card" />
        </div>
        <p className="mt-3 text-center text-sm text-muted">Figures 5–6. Chronological split. Rolling windows only after a leakage-safe shift.</p>
        <p className="mt-6 leading-8">
          Target: weekly reported or suspected counts for a named notifiable disease. Horizon:
          four weeks default (2–12 allowed). Split: chronological. Features are computed after a
          shift so tomorrow’s rain flag does not sneak into today’s prediction.
        </p>
        <p className="mt-4 leading-8">
          How a number is born on the desk, in order:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7">
          <li>Load official points if an extract exists for that disease × geography; otherwise generate a 260-week Ghana-shaped demonstration series (seeded, reproducible).</li>
          <li>Hold out the last ~20% (capped at 26 weeks). Train never sees the hold-out.</li>
          <li>Build features on the training window only: lag 1–4, rolling mean/std of the previous four weeks, week-of-year, month, rainy-season flag, harmattan flag.</li>
          <li>Fit ridge (closed-form, tiny L2) and a 24-tree forest. Fit Holt on train only.</li>
          <li>Score every family against the hold-out with MAE, RMSE, sMAPE.</li>
          <li>Ensemble the three lowest-MAE families. Print the interval union.</li>
          <li>Walk the same features forward for the requested horizon, feeding predictions back as lags.</li>
        </ol>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {MODELS.map(([name, body]) => (
            <div key={name} className="rounded-3xl border border-line bg-white p-5">
              <div className="font-semibold">{name}</div>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 leading-8">
          sMAPE exists because cholera and yellow fever sit near zero most weeks — MAPE explodes.
          Tree percentiles approximate forest intervals; they are not a Bayesian posterior. SARIMA
          stays in the Python notebook for teaching native prediction intervals. Deep nets are not
          justified on a few hundred weekly points.
        </p>
        <p className="mt-4 leading-8">
          Feature importance is a weight, not a cause. <em>lag_1</em> will almost always win. That
          does not mean last week “caused” this week in the epidemiological sense.
        </p>
      </article>

      <article id="m07" className="mt-16">
        <Eyebrow n="07" />
        <h2 className="font-display text-4xl tracking-tight">Early warning is not confirmation</h2>
        <img src="/images/early-warning.png" alt="Early warning" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <p className="mt-3 text-center text-sm text-muted">Figure 7. Historical baseline → expected → observed → deviation → threshold → investigation.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Pill title="z > 2 · watch" tone="bg-gold-soft" body="Eight-week baseline. Check reporting outage, batch dump, lab backlog." />
          <Pill title="z > 2.6 or CUSUM" tone="bg-gold-soft" body="Accumulated excess. Still an investigation, not a press release." />
          <Pill title="z > 3.5 · severe" tone="bg-red-soft" body="Mobilise people, not the model. The model is not the incident manager." />
        </div>
        <p className="mt-6 leading-8">
          Forecasting asks “what is likely next.” Detection asks “is what we are seeing strange
          enough to act?” Both live on this site. Neither replaces a district rapid-response team.
          CUSUM is computed against the first 60% of the series so a long outbreak cannot redefine
          “normal” underneath itself.
        </p>
      </article>

      <article id="m08" className="mt-16">
        <Eyebrow n="08" />
        <h2 className="font-display text-4xl tracking-tight">OpenRouter — one key, groups of three</h2>
        <p className="mt-4 leading-8">
          There is a single server-side <code>OPENROUTER_API_KEY</code>. It is never shipped to the
          browser. One key is enough because OpenRouter already sits in front of OpenAI, Google,
          Anthropic, DeepSeek, Meta, Mistral and the free-tier hosts.
        </p>
        <p className="mt-4 leading-8">
          Live forensic finding (2026-08-19, production host): sending more than three slugs in
          the request <code>models</code> array returns{" "}
          <code>400 &apos;models&apos; array must have 3 items or fewer.</code> That is why older
          builds looked as if “the API key does not work.” The key was valid. The payload was not.
          Tavily and OpenWeather already answered 200 on the same host.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 leading-7">
          <li>The full chain is chunked into groups of three (OpenRouter’s hard limit).</li>
          <li>Each group is sent as <code>model</code> + <code>models[≤3]</code> with <code>provider.allow_fallbacks</code>.</li>
          <li>A dead GPT-4.1 slug does not kill Gemini in the same group, or the next group.</li>
          <li>A 402 (empty OpenRouter balance) drops the remaining paid groups and retries <code>:free</code> models.</li>
          <li>Last resort is <code>openrouter/auto</code>.</li>
          <li>401 / true auth-403 stops the chain and tells the officer the key was rejected — we do not pretend it worked.</li>
        </ol>
        <p className="mt-4 leading-8">
          Failed attempts are not billed. Quota on one vendor is transient: the next request starts
          at the top of the list again. Free models are weaker and rate-limited. They keep the desk
          alive; they do not make the future error-free.
        </p>
        <p className="mt-4 leading-8">
          Default paid group 1: <code>openai/gpt-4.1-mini</code> → <code>google/gemini-2.5-flash</code> →{" "}
          <code>openai/gpt-4o-mini</code>. You may prepend slugs with the <code>OPENROUTER_MODELS</code>
          environment variable (comma-separated). They are still chunked into threes.
        </p>
      </article>

      <article id="m09" className="mt-16">
        <Eyebrow n="09" />
        <h2 className="font-display text-4xl tracking-tight">The other keys</h2>
        <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-muted">
              <tr>
                <th className="px-4 py-3">Secret</th>
                <th>What it unlocks</th>
              </tr>
            </thead>
            <tbody>
              {KEYS.map(([k, v]) => (
                <tr key={k} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs">{k}</td>
                  <td className="py-3 pr-4 text-muted">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 leading-8">
          Alias names are accepted so a mistyped Render variable still works:{" "}
          <code>OPEN_ROUTER_API_KEY</code>, <code>TAVILY_KEY</code>, <code>OPENWEATHERMAP_API_KEY</code>,{" "}
          <code>XI_API_KEY</code>, and an <code>OPENAI_API_KEY</code> that actually starts with{" "}
          <code>sk-or-</code>. Quotes and a leading <code>Bearer</code> are stripped.
        </p>
        <p className="mt-4 leading-8">
          Never put a secret in <code>NEXT_PUBLIC_*</code>. Those strings are compiled into the
          browser bundle. The blueprint no longer pins empty strings for optional keys — an empty
          default would wipe a dashboard secret on the next Apply.
        </p>
      </article>

      <article id="m10" className="mt-16">
        <Eyebrow n="10" />
        <h2 className="font-display text-4xl tracking-tight">Vision Lab — any file GHS can hold</h2>
        <p className="mt-4 leading-8">
          A district office does not live in a single CSV. The Vision Lab accepts PDF circulars,
          Word memos, Excel line lists, CSV extracts, lab photos and IDSR scans. Text layers are
          parsed locally (<code>lib/files.ts</code>). Images and PDFs go through the vision chain
          (Gemini Flash → GPT-4o-mini → Gemini Pro → GPT-4.1 → Claude). If file-parts fail, the
          desk falls back to text-only so the officer still gets a structured Ghana field list.
        </p>
        <p className="mt-4 leading-8">
          Every run is redacted, stored, and written to the audit log with a redaction count.
          The model is asked for: what the file actually contains, structured fields, fitness for
          the weekly engine, data-quality flags, One Health relevance, and a confidence plus the
          next human verification step. It is forbidden to diagnose an individual.
        </p>
      </article>

      <article id="m11" className="mt-16">
        <Eyebrow n="11" />
        <h2 className="font-display text-4xl tracking-tight">Intelligence, voice, search</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card title="Ghana-locked chat" body="The system prompt is GHANA_CONTEXT. Sixteen regions. Thirteen signals. No invented circulars. Optional live ensemble JSON is attached when a disease is selected." />
          <Card title="Web search" body="Tavily advanced search over GHS / MoH / WHO / NADMO / Noguchi domains. DuckDuckGo HTML is the offline path. Hits are labelled unverified." />
          <Card title="Voice in" body="Web Speech API on Chrome / Edge (en-GH). Optional Whisper via OpenRouter if the host exposes /v1/audio/transcriptions." />
          <Card title="Voice out" body="ElevenLabs multilingual when the key can speak. Restricted keys fail /v1/user with missing_permissions — the desk probes /v1/voices instead. Otherwise the device voice." />
        </div>
      </article>

      <article id="m12" className="mt-16">
        <Eyebrow n="12" />
        <h2 className="font-display text-4xl tracking-tight">Extracts, nowcast, field cards</h2>
        <p className="mt-4 leading-8">
          The upgrade that matters more than another model is an official weekly file.{" "}
          <Link href="/extracts" className="text-ghana-green underline">Extracts</Link> parse it,
          write a quality log, ask OpenRouter for a 120-word fitness review, and hand the series to
          the forecast desk. Completeness is a number, not a vibe. A Ghana template CSV is one click
          away.
        </p>
        <p className="mt-4 leading-8">
          Last weeks are incomplete reports, not necessarily a true drop. The reporting-delay
          nowcast inflates the latest points with a decaying completeness curve and prints an
          interval. It is not a secret true count. Vintage tables come later, when DHIMS2 revisions
          are wired.
        </p>
        <p className="mt-4 leading-8">
          The field card is ninety words a CHPS officer can hear. Three numbered actions. Explicit
          “this is not confirmation.” Language is a first-class control, not an afterthought.
        </p>
      </article>

      <article id="m13" className="mt-16">
        <Eyebrow n="13" />
        <h2 className="font-display text-4xl tracking-tight">Climate as a pillar, not decoration</h2>
        <p className="mt-4 leading-8">
          Watch-cities: Accra, Kumasi, Takoradi, Cape Coast, Koforidua, Ho, Tamale, Bolgatanga, Wa,
          Sunyani. Requests run in parallel so the desk does not wait on ten sequential handshakes.
          Rain and humidity are pressure, not destiny. Pair them with cholera and malaria intervals
          on the forecast desk. The morning sitrep may mix weather, Tavily hits, and the national
          ensemble — still an investigation draft, still not a circular.
        </p>
      </article>

      <article id="m14" className="mt-16">
        <Eyebrow n="14" />
        <h2 className="font-display text-4xl tracking-tight">Regions, districts, small cells</h2>
        <img src="/images/ghana-regions.png" alt="Sixteen regions" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <p className="mt-3 text-center text-sm text-muted">Figure 8. Sixteen regions. The unit of analysis moved from “one country” to “one Ghana region-week.”</p>
        <p className="mt-6 leading-8">
          Sixteen regions on the official map. Representative MMDAs sit under each region so a
          district overlay can be taught. We do not list all 261 assemblies: small-cell counts
          re-identify children, rare diseases, and single facilities. Completeness here means
          “every region has districts on the desk,” not “every MMDA is enumerated.”
        </p>
      </article>

      <article id="m15" className="mt-16">
        <Eyebrow n="15" />
        <h2 className="font-display text-4xl tracking-tight">Admin, CMS, audit, archive</h2>
        <ul className="mt-4 space-y-3 leading-7">
          <li>CMS for copy, announcement bar, Ghana green / gold / red / teal.</li>
          <li>Every chat, vision run, forecast, and extract writes an audit row (actor, action, model, redaction count).</li>
          <li>HMAC-SHA256 signed export. Post the file back to <code>/api/admin/audit</code> to verify it was not edited.</li>
          <li>Append-only <code>events.jsonl</code> on disk; optional Postgres snapshot so free-web sleep does not wipe history.</li>
          <li>API desk probes OpenRouter (3-model payload), Tavily, OpenWeather, and ElevenLabs voices.</li>
        </ul>
      </article>

      <article id="m16" className="mt-16">
        <Eyebrow n="16" />
        <h2 className="font-display text-4xl tracking-tight">Hosting on Render — what actually boots</h2>
        <p className="mt-4 leading-8">
          One Node web service. Build: <code>npm ci --include=dev && npm run build</code>. Start:{" "}
          <code>npm start</code> binds <code>0.0.0.0</code> and honours <code>$PORT</code>. Health:{" "}
          <code>/api/health</code>. Frankfurt is the nearest common region to Accra.
        </p>
        <p className="mt-4 leading-8">
          Render free web sleeps after ~15 minutes. The next visitor waits on a cold start. Free
          Postgres expires on Render’s hobby clock. Huge vision PDFs can exhaust 512&nbsp;MB RAM.
          Outbound TLS from some sandboxes fails even when the key is valid — use Admin → API desk
          on the live host. None of this is hidden in the product copy.
        </p>
        <p className="mt-4 leading-8">
          Required dashboard secrets: <code>OPENROUTER_API_KEY</code>, <code>ADMIN_PASSWORD</code>,{" "}
          <code>SESSION_SECRET</code>, <code>NEXT_PUBLIC_SITE_URL</code>. Optional: Tavily,
          ElevenLabs, OpenWeather, <code>OPENROUTER_MODELS</code>. After a deploy, open{" "}
          <Link href="/api/health" className="text-ghana-green underline">/api/health</Link> and
          expect <code>openrouter: true</code> if the key is present.
        </p>
      </article>

      <article id="m17" className="mt-16">
        <Eyebrow n="17" />
        <h2 className="font-display text-4xl tracking-tight">Forensic findings that changed the code</h2>
        <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-muted">
              <tr>
                <th className="px-4 py-3">Finding</th>
                <th>Fix</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Phase 2 figures were empty boxes", "Illustrated PNG figures ship in /public/images and in the PDF."],
                ["code.txt defaulted to South Africa", "Ghana default in the notebook and the live desk."],
                ["SARIMA fit on the full series", "Fit on train only; forecast len(test)."],
                ["RF merge after a leaky split", "Engineer features, then split."],
                ["alerts [[ syntax error", "Fixed print in the companion notebook."],
                ["fillna(method='ffill') deprecated", ".ffill()."],
                ["OpenRouter models[] longer than 3 → 400 on the live host", "Chunk the chain into groups of three. That was the 'key does not work' bug."],
                ["ElevenLabs /v1/user → missing_permissions", "Probe /v1/voices; TTS still works on restricted keys."],
                ["Blueprint empty-string env defaults", "sync: false so Apply cannot wipe dashboard secrets."],
                ["Scoreboard compared two forecasts to each other", "MAE/RMSE/sMAPE now score walk-forward backtests against the hold-out."],
                ["Climate cities fetched one-by-one", "Promise.all."],
                ["Forecast button said Running… on every compute", "Separate 'Computing ensemble' from 'Drafting briefing'."],
              ].map(([f, x]) => (
                <tr key={f} className="border-t border-line">
                  <td className="px-4 py-3">{f}</td>
                  <td className="py-3 pr-4 text-muted">{x}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article id="m18" className="mt-16">
        <Eyebrow n="18" />
        <h2 className="font-display text-4xl tracking-tight">Ethics and what we refuse</h2>
        <ul className="mt-4 space-y-2 leading-7">
          <li>No “error-free” future. That sentence is scientifically false.</li>
          <li>No individual clinical diagnosis from a photograph.</li>
          <li>No outbreak confirmation from a z-score.</li>
          <li>No patient name, folder number, phone, or small-cell paediatric count in a prompt.</li>
          <li>No API key in <code>NEXT_PUBLIC_*</code> or client JavaScript.</li>
          <li>No global operations centre. Ghana only, unless the user is comparing an imported border risk.</li>
          <li>OpenRouter may draft a briefing. It may not decide that an intervention launches.</li>
        </ul>
      </article>

      <article id="m19" className="mt-16">
        <Eyebrow n="19" />
        <h2 className="font-display text-4xl tracking-tight">Acceptance test for the class</h2>
        <p className="mt-4 leading-8">The original capstone is now the live checklist:</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 leading-7">
          <li>Frame a Ghana problem (disease + region + why One Health).</li>
          <li>Ingest a public or official extract. Keep the quality log.</li>
          <li>Show two models plus a naive baseline on a chronological hold-out.</li>
          <li>Print intervals. Print z / CUSUM watches. Write feature caveats.</li>
          <li>Log which model actually answered (OpenRouter fallback is a feature, not a mystery).</li>
          <li>One-page limit statement. Field investigation remains mandatory.</li>
        </ol>
        <p className="mt-4 leading-8">
          The site is the demonstration. The notebook <code>notebooks/ghana_one_health_forecasting.py</code> is the
          reproducible proof. Originals live under <code>docs/originals/</code>.
        </p>
      </article>

      <article id="m20" className="mt-16 mb-8">
        <Eyebrow n="20" />
        <h2 className="font-display text-4xl tracking-tight">A Monday morning on the desk</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 leading-7">
          <li>Open <Link href="/surveillance" className="text-ghana-green underline">Surveillance</Link>. Anything above z = 2?</li>
          <li>Click through to <Link href="/forecast" className="text-ghana-green underline">Forecast</Link>. Prefer the interval. Load last week’s DHIMS2 file if it has arrived.</li>
          <li>Check <Link href="/climate" className="text-ghana-green underline">Climate</Link> for rain and heat on the same regions.</li>
          <li>Ask <Link href="/intelligence" className="text-ghana-green underline">Intelligence</Link> for a 180-word briefing with search on. Refuse to paste names.</li>
          <li>If a photo or circular landed overnight, drop it in <Link href="/vision" className="text-ghana-green underline">Vision Lab</Link>.</li>
          <li>Send a <Link href="/field" className="text-ghana-green underline">field card</Link> in Twi or English to the CHPS compound that has to walk the water points.</li>
          <li>Remember: the model drafted the paragraph. The officer still owns the decision.</li>
        </ol>
        <img src="/images/hero-clinic.png" alt="Command room" className="mt-8 w-full rounded-[28px] border border-line object-cover shadow-card" />
        <p className="mt-3 text-center text-sm text-muted">Figure 9. The white national desk this workbook is written to justify.</p>
        <p className="mt-6 text-sm text-muted">
          Decision support only. Forecasts are probabilistic. Alerts are investigation prompts.
          Ghana Health Service remains the authority of record.
        </p>
      </article>
    </div>
  );
}

function Eyebrow({ n }: { n: string }) {
  return <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal">Chapter {n}</div>;
}

function Pill({ title, body, tone }: { title: string; body: string; tone: string }) {
  return (
    <div className={`rounded-3xl ${tone} p-5`}>
      <div className="font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6">{body}</p>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[28px] border border-line bg-white p-6 shadow-card">
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-muted">{body}</p>
    </div>
  );
}
