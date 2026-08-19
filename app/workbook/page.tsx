import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";

export const metadata = { title: "National systems workbook" };

const TOC = [
  ["01", "Why this workbook exists"],
  ["02", "The Ghana One Health contract"],
  ["03", "What we are building — ten desks"],
  ["04", "Data that may enter the system"],
  ["05", "The statistical engine"],
  ["06", "Early warning vs confirmation"],
  ["07", "OpenRouter as one key, many models"],
  ["08", "Vision, voice, search, climate"],
  ["09", "Extracts, nowcast, field cards"],
  ["10", "Regions, districts, small cells"],
  ["11", "Admin, audit, archive"],
  ["12", "Hosting, keys, failure modes"],
  ["13", "Ethics and what we refuse"],
  ["14", "Acceptance test for the class"],
  ["15", "How an officer uses a Monday morning"],
];

const DESKS = [
  { href: "/", name: "Home", job: "National briefing surface. Pillars, signals, honest limits." },
  { href: "/forecast", name: "Forecast desk", job: "Leakage-safe ensemble, 2–12 week horizon, interval not a point, official CSV overlay, delay nowcast." },
  { href: "/surveillance", name: "Surveillance board", job: "All 13 signals, latest count, z-score, next-week interval. Watch vs investigate." },
  { href: "/climate", name: "Climate desk", job: "OpenWeather watch-cities plus a sitrep that may mix weather, search, and the ensemble." },
  { href: "/intelligence", name: "Intelligence", job: "Ghana-locked chat, web search, voice in/out, language, live ensemble attached to the prompt." },
  { href: "/vision", name: "Vision Lab", job: "PDF, Word, Excel, CSV, photos. Local text extract + multi-model vision. Redaction first." },
  { href: "/extracts", name: "Extracts", job: "DHIMS2 / IDSR weekly CSV. Quality log, completeness, OpenRouter review, then the forecast uses that series." },
  { href: "/field", name: "Field brief", job: "Ninety-word CHPS card in English, Twi, Ewe, Ga or Hausa. Speak it." },
  { href: "/regions", name: "Regions", job: "Sixteen official regions plus representative MMDAs. Unit of analysis is region-week." },
  { href: "/workbook", name: "This workbook", job: "The modified Phase 2 teaching contract and the map of every system we built." },
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
  ["Naive", "Last week repeats. The minister’s cheapest rival."],
  ["Seasonal naive", "Same week last year (52). Ghana’s two clocks: rains and harmattan."],
  ["4-week MA", "Recent momentum. Smooths noise, lags a true turn."],
  ["Holt linear", "Level + trend. Dangerous if you let it run forever."],
  ["Ridge", "lag_1–4, rolling mean/std (shifted), week, month, rainy, harmattan."],
  ["Random forest", "Same features, leakage-safe split. Percentile band, not a posterior."],
  ["Ensemble", "Three lowest MAE on the chronological hold-out. Ships only if it earns it."],
];

const KEYS = [
  ["OPENROUTER_API_KEY", "Chat, vision, briefing, extract review, field card. One key. Sequential fallback + :free + openrouter/auto."],
  ["TAVILY_API_KEY", "Cited search. Without it the desk uses DuckDuckGo HTML."],
  ["ELEVENLABS_API_KEY", "Studio voice. Without it the browser speaks."],
  ["OPENWEATHER_API_KEY", "Live Accra, Kumasi, Tamale… Without it, climatic placeholders."],
  ["ADMIN_* / SESSION_SECRET", "CMS, colours, nav, knowledge, signed audit."],
  ["DATABASE_URL", "Optional Postgres so history survives free-web sleep."],
];

export default function WorkbookPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">
        Phase 2 · modified · Ghana Health Service
      </p>
      <h1 className="font-display mt-2 text-4xl tracking-tight md:text-6xl">
        The systems workbook — how ONE HEALTH GHANA is supposed to work
      </h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
        Original title: <i>ONE HEALTH PANDEMIC AND DISEASE OUTBREAK FORECASTING — Phase 2</i>.
        The class notebook taught a single COVID series in Colab. The production brief is a
        national desk: sixteen regions, thirteen One Health signals, files and photographs,
        OpenRouter fallback, voice, climate, extracts, and an honest interval. This page is
        that brief, written so a district director can read it on a Monday.
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
          ["10", "public desks"],
          ["7", "forecast families"],
          ["4 wks", "default horizon"],
          ["z > 2", "investigation watch"],
          ["1 key", "OpenRouter chain"],
          ["0", "patient identifiers"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-3xl border border-line bg-white p-5 shadow-card">
            <div className="font-display text-3xl">{n}</div>
            <div className="mt-1 text-sm text-muted">{l}</div>
          </div>
        ))}
      </section>

      <nav className="mt-10 rounded-[28px] border border-line bg-white p-6 shadow-card">
        <h2 className="font-display text-2xl">Contents</h2>
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

      <article id="m01" className="mt-16">
        <Eyebrow n="01" />
        <h2 className="font-display text-4xl tracking-tight">Why this workbook exists</h2>
        <p className="mt-4 leading-8">
          The Phase 2 PDF was a teaching artefact: Colab, Gemini as tutor, one country, COVID weekly
          counts, figures that were captions without pictures. The scientific contract inside it was
          sound and is kept: chronological splits, leakage-safe lags, baselines before machine learning,
          intervals not points, alerts are not outbreaks, the model is not the analyst of record.
        </p>
        <p className="mt-4 leading-8">
          The professor’s modification is operational. Walk out of class into a Ghana Health Service
          system. That means: Ghana only; many diseases; documents and photographs as first-class
          inputs; one OpenRouter key with a real fallback chain; spoken field cards; web search;
          climate as a pillar, not decoration; a white national UI; and a path onto Render with
          secrets that never touch the browser.
        </p>
        <img src="/images/data-decision-pipeline.png" alt="Data to decision pipeline" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
      </article>

      <article id="m02" className="mt-16">
        <Eyebrow n="02" />
        <h2 className="font-display text-4xl tracking-tight">The Ghana One Health contract</h2>
        <img src="/images/one-health-convergence.png" alt="One Health convergence" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
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
      </article>

      <article id="m03" className="mt-16">
        <Eyebrow n="03" />
        <h2 className="font-display text-4xl tracking-tight">What we are building — ten desks</h2>
        <img src="/images/system-architecture.png" alt="System architecture" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
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
          Admin (`/admin`) is the eleventh room: CMS copy, Ghana flag colours, nav visibility,
          knowledge cards, document/chat/forecast records, API probe, signed HMAC audit.
        </p>
      </article>

      <article id="m04" className="mt-16">
        <Eyebrow n="04" />
        <h2 className="font-display text-4xl tracking-tight">Data that may enter the system</h2>
        <img src="/images/vision-ingest.png" alt="Ingest" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <ul className="mt-6 space-y-3 leading-7">
          <li><strong>Official weekly extract.</strong> DHIMS2 / IDSR CSV: week-ending or date + cases. Semicolon and tab accepted. Quality log records missing weeks, duplicates, negatives clipped, completeness.</li>
          <li><strong>Demonstration series.</strong> Epidemiologically shaped Ghana histories so the desk teaches before an official file arrives. Never pretend they are DHIMS2.</li>
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

      <article id="m05" className="mt-16">
        <Eyebrow n="05" />
        <h2 className="font-display text-4xl tracking-tight">The statistical engine</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <img src="/images/chrono-split.png" alt="Chronological split" className="w-full rounded-[28px] border border-line bg-white shadow-card" />
          <img src="/images/feature-pipeline.png" alt="Feature pipeline" className="w-full rounded-[28px] border border-line bg-white shadow-card" />
        </div>
        <p className="mt-6 leading-8">
          Target: weekly reported or suspected counts for a named notifiable disease. Horizon:
          four weeks default (2–12 allowed). Split: chronological. Random train/test is forbidden —
          that is temporal leakage. Features are computed after a shift so tomorrow’s rain flag
          does not sneak into today’s prediction.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {MODELS.map(([name, body]) => (
            <div key={name} className="rounded-3xl border border-line bg-white p-5">
              <div className="font-semibold">{name}</div>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 leading-8">
          Metrics on the hold-out: MAE, RMSE, sMAPE. sMAPE exists because cholera and yellow fever
          sit near zero most weeks — MAPE explodes. A number is printed as{" "}
          <code>127 (105–151)</code>, never as 127. Tree percentiles approximate forest intervals;
          they are not a Bayesian posterior. SARIMA stays in the Python notebook for teaching
          native prediction intervals. Deep nets are not justified on a few hundred weekly points.
        </p>
        <p className="mt-4 leading-8">
          Feature importance is a weight, not a cause. <em>lag_1</em> will almost always win. That
          does not mean last week “caused” this week in the epidemiological sense.
        </p>
      </article>

      <article id="m06" className="mt-16">
        <Eyebrow n="06" />
        <h2 className="font-display text-4xl tracking-tight">Early warning is not confirmation</h2>
        <img src="/images/early-warning.png" alt="Early warning" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Pill title="z > 2 · watch" tone="bg-gold-soft" body="Eight-week baseline. Check reporting outage, batch dump, lab backlog." />
          <Pill title="z > 2.6 or CUSUM" tone="bg-gold-soft" body="Accumulated excess. Still an investigation, not a press release." />
          <Pill title="z > 3.5 · severe" tone="bg-red-soft" body="Mobilise people, not the model. The model is not the incident manager." />
        </div>
        <p className="mt-6 leading-8">
          Forecasting asks “what is likely next.” Detection asks “is what we are seeing strange
          enough to act?” Both live on this site. Neither replaces a district rapid-response team.
        </p>
      </article>

      <article id="m07" className="mt-16">
        <Eyebrow n="07" />
        <h2 className="font-display text-4xl tracking-tight">OpenRouter — one key, many models</h2>
        <p className="mt-4 leading-8">
          There is a single server-side <code>OPENROUTER_API_KEY</code>. It is never shipped to the
          browser. One key is enough because OpenRouter already sits in front of OpenAI, Google,
          Anthropic, DeepSeek, Meta, Mistral and the free-tier hosts.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 leading-7">
          <li>First request sends an ordered <code>models[]</code> list with <code>allow_fallbacks</code> and <code>route: fallback</code>.</li>
          <li>If that bundle fails, each slug is tried alone. A dead GPT-4.1 slug does not kill Gemini.</li>
          <li>A 402 (empty OpenRouter balance) drops the chain onto <code>:free</code> models.</li>
          <li>Last resort is <code>openrouter/auto</code>.</li>
          <li>401 / 403 stops the chain and tells the officer the key was rejected — we do not pretend it worked.</li>
        </ol>
        <p className="mt-4 leading-8">
          Failed attempts are not billed. Quota on one vendor is transient: the next request starts
          at the top of the list again. Free models are weaker and rate-limited. They keep the desk
          alive; they do not make the future error-free.
        </p>
      </article>

      <article id="m08" className="mt-16">
        <Eyebrow n="08" />
        <h2 className="font-display text-4xl tracking-tight">Vision, voice, search, climate</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card title="Vision Lab" body="Any file GHS can hold. Local extract for text layers. Vision models for scans and photos. If file-parts fail, the desk falls back to text-only so the officer still gets a structured Ghana field list." />
          <Card title="Voice" body="Web Speech for dictation (Chrome / Edge). ElevenLabs when the key is live; otherwise the device voice. Twi, Ewe, Ga, Hausa synthesis is imperfect — read the card if the voice stumbles." />
          <Card title="Search" body="Live hits are labelled as unverified. Cite URLs. Never invent a GHS circular. Ghana-weighted domains first." />
          <Card title="Climate" body="Watch-cities across the belts. Rain and humidity are pressure, not destiny. Pair them with cholera and malaria intervals on the forecast desk." />
        </div>
      </article>

      <article id="m09" className="mt-16">
        <Eyebrow n="09" />
        <h2 className="font-display text-4xl tracking-tight">Extracts, nowcast, field cards</h2>
        <p className="mt-4 leading-8">
          The upgrade that matters more than another model is an official weekly file.{" "}
          <Link href="/extracts" className="text-ghana-green underline">Extracts</Link> parse it,
          write a quality log, ask OpenRouter for a 120-word fitness review, and hand the series to
          the forecast desk. Completeness is a number, not a vibe.
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

      <article id="m10" className="mt-16">
        <Eyebrow n="10" />
        <h2 className="font-display text-4xl tracking-tight">Regions, districts, small cells</h2>
        <img src="/images/ghana-regions.png" alt="Sixteen regions" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <p className="mt-6 leading-8">
          Sixteen regions on the official map. Representative MMDAs sit under each region so a
          district overlay can be taught. We do not list all 261 assemblies: small-cell counts
          re-identify children, rare diseases, and single facilities. Completeness here means
          “every region has districts on the desk,” not “every MMDA is enumerated.”
        </p>
      </article>

      <article id="m11" className="mt-16">
        <Eyebrow n="11" />
        <h2 className="font-display text-4xl tracking-tight">Admin, audit, archive</h2>
        <ul className="mt-4 space-y-3 leading-7">
          <li>CMS for copy, announcement bar, Ghana green / gold / red / teal.</li>
          <li>Every chat, vision run, forecast, and extract writes an audit row (actor, action, model, redaction count).</li>
          <li>HMAC-SHA256 signed export. Post the file back to <code>/api/admin/audit</code> to verify it was not edited.</li>
          <li>Append-only <code>events.jsonl</code> on disk; optional Postgres snapshot so free-web sleep does not wipe history.</li>
        </ul>
      </article>

      <article id="m12" className="mt-16">
        <Eyebrow n="12" />
        <h2 className="font-display text-4xl tracking-tight">Hosting, keys, failure modes</h2>
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
          Render free web sleeps after ~15 minutes. The next visitor waits on a cold start. Free
          Postgres expires on Render’s hobby clock. Huge vision PDFs can exhaust 512&nbsp;MB RAM.
          Outbound TLS from some sandboxes fails even when the key is valid — use Admin → API desk
          on the live host. None of this is hidden in the product copy.
        </p>
      </article>

      <article id="m13" className="mt-16">
        <Eyebrow n="13" />
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

      <article id="m14" className="mt-16">
        <Eyebrow n="14" />
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

      <article id="m15" className="mt-16 mb-8">
        <Eyebrow n="15" />
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
