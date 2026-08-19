import Link from "next/link";
import { ArrowRight, Eye, Mic, Radio, ShieldAlert, Sparkles } from "lucide-react";
import { Disclaimer } from "@/components/Disclaimer";
import { DISEASES, REGIONS } from "@/lib/ghana";

const CAPS = [
  {
    href: "/forecast",
    icon: Radio,
    title: "4-week ensemble forecast",
    body: "Naive, seasonal naive, Holt, ridge and leakage-safe random forest — then an interval, not a single number.",
  },
  {
    href: "/surveillance",
    icon: ShieldAlert,
    title: "IDSR-style early warning",
    body: "Z-score watches against an eight-week baseline. An alert starts an investigation; it never ends one.",
  },
  {
    href: "/vision",
    icon: Eye,
    title: "Vision on any artefact",
    body: "Photos, scanned IDSR forms, lab slips, charts. Multi-model vision reads them and flags identifiers.",
  },
  {
    href: "/intelligence",
    icon: Mic,
    title: "Voice + web intelligence",
    body: "Speak a briefing. Search WHO, GHS and NADMO sources. OpenRouter falls back when one model is exhausted.",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-8 pt-10 md:grid-cols-2 md:px-6 md:pt-16">
        <div className="rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ghana-green">
            <Sparkles className="h-3.5 w-3.5" /> Ghana only · 2026 command layer
          </div>
          <h1 className="font-display mt-5 text-4xl leading-[1.05] tracking-tight md:text-6xl">
            See the next month of Ghana’s health — with the humility of an interval.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
            ONE HEALTH GHANA turns surveillance files, photographs, and weekly counts into probabilistic forecasts for the Ghana Health Service. Human, animal, and environmental signals share one white desk.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/forecast" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
              Open forecast desk <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/workbook" className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold">
              Read the modified workbook
            </Link>
          </div>
          <div className="mt-6">
            <Disclaimer />
          </div>
        </div>
        <div className="rise relative">
          <img src="/images/hero-clinic.png" alt="Ghana Health Service command room" className="aspect-[4/3] w-full rounded-[28px] object-cover shadow-card ring-1 ring-line" />
          <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white/90 p-4 text-sm shadow-card backdrop-blur">
            16 regions · {DISEASES.length} One Health signals · OpenRouter fallback chain · voice, vision, search
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 md:grid-cols-4 md:px-6">
        {[
          ["16", "GHS regions on the map"],
          [`${DISEASES.length}`, "human, animal, climate signals"],
          ["4 wks", "default forecast horizon"],
          ["z > 2", "investigation threshold"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-3xl border border-line bg-white p-5 shadow-card">
            <div className="font-display text-3xl">{n}</div>
            <div className="mt-1 text-sm text-muted">{l}</div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <div className="grid gap-8 md:grid-cols-2">
          <img src="/images/one-health-convergence.png" alt="One Health convergence" className="rounded-[28px] border border-line bg-white object-cover shadow-card" />
          <div>
            <h2 className="font-display text-3xl tracking-tight">Three pillars, one Ghana desk</h2>
            <p className="mt-4 leading-7 text-muted">
              Most emerging infections start where people, animals, and the environment meet — live-bird markets in Accra, rodent harvest stores in Oti, flood water in Odaw, harmattan dust in the Upper East. The platform is built so those streams can be loaded as files, photos, or weekly extracts and read together.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="rounded-2xl bg-green-soft px-4 py-3"><b>Human — GHS / IDSR / DHIMS2.</b> Notifiable diseases, ILI, facility load.</li>
              <li className="rounded-2xl bg-gold-soft px-4 py-3"><b>Animal — Veterinary Services.</b> HPAI flocks, anthrax carcasses, abortive events.</li>
              <li className="rounded-2xl bg-teal-soft px-4 py-3"><b>Environment — EPA / GMet / NADMO.</b> Flood index, rainfall anomaly, water quality.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 md:grid-cols-2 md:px-6">
        {CAPS.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-[28px] border border-line bg-white p-6 shadow-card transition hover:-translate-y-0.5">
            <c.icon className="h-6 w-6 text-ghana-green" />
            <h3 className="mt-4 font-display text-2xl">{c.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{c.body}</p>
            <div className="mt-4 text-sm font-semibold text-ghana-green group-hover:underline">Open</div>
          </Link>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <h2 className="font-display text-3xl">How a number is born</h2>
        <p className="mt-3 max-w-3xl text-muted">Copied from the Phase 2 workbook, then made operational for Ghana. Every arrow can introduce error.</p>
        <img src="/images/data-decision-pipeline.png" alt="Data to decision pipeline" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <img src="/images/system-architecture.png" alt="System architecture" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl">Priority signals</h2>
          <Link href="/forecast" className="text-sm font-semibold text-ghana-green">Forecast any of them →</Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DISEASES.map((d) => (
            <Link key={d.id} href={`/forecast?disease=${d.id}`} className="rounded-3xl border border-line bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-teal">{d.group} · {d.pillar}</div>
              <div className="mt-1 font-display text-xl">{d.name}</div>
              <p className="mt-2 text-sm leading-6 text-muted">{d.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <img src="/images/ghana-regions.png" alt="Sixteen regions of Ghana" className="rounded-[28px] border border-line bg-white shadow-card" />
          <div>
            <h2 className="font-display text-3xl">{REGIONS.length} regions, one national roll-up</h2>
            <p className="mt-4 text-muted leading-7">
              Start national, then drop to Greater Accra cholera or Upper East CSM. The unit of analysis in the workbook was “one country.” The production system’s unit is a Ghana region-week — still simple enough to defend, specific enough to staff a response.
            </p>
            <Link href="/regions" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ghana-green">
              Browse the regional desk <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
