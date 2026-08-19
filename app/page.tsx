"use client";

import Link from "next/link";
import { ArrowRight, CloudSun, Eye, Mic, Radio, ShieldAlert, Sparkles } from "lucide-react";
import { Disclaimer } from "@/components/Disclaimer";
import { useSite } from "@/components/SiteProvider";
import { DISEASES, REGIONS } from "@/lib/ghana";

const ICONS = [Radio, ShieldAlert, Eye, Mic];

export default function HomePage() {
  const { content } = useSite();
  const caps = [
    { href: "/forecast", title: "4-week ensemble forecast", body: "Naive, seasonal naive, Holt, ridge and leakage-safe random forest - then an interval, not a single number." },
    { href: "/surveillance", title: "IDSR-style early warning", body: "Z-score watches against an eight-week baseline. An alert starts an investigation; it never ends one." },
    { href: "/vision", title: "Vision on any file", body: "PDF, Word, Excel, CSV, photos, scans. Multi-model vision extracts Ghana fields and flags identifiers." },
    { href: "/intelligence", title: "Voice + web intelligence", body: "Speak a briefing. Search WHO, GHS and NADMO sources. OpenRouter falls back when one model is exhausted." },
  ];

  return (
    <div>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-8 pt-10 md:grid-cols-2 md:px-6 md:pt-16">
        <div className="rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ghana-green">
            <Sparkles className="h-3.5 w-3.5" /> {content.heroKicker}
          </div>
          <h1 className="font-display mt-5 text-4xl leading-[1.05] tracking-tight md:text-6xl">{content.heroTitle}</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">{content.heroBody}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/forecast" className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
              {content.heroPrimary} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/workbook" className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold">
              {content.heroSecondary}
            </Link>
          </div>
          <div className="mt-6">
            <Disclaimer />
          </div>
        </div>
        <div className="rise relative">
          <img src="/images/hero-clinic.png" alt="Ghana Health Service command room" className="aspect-[4/3] w-full rounded-[28px] object-cover shadow-card ring-1 ring-line" />
          <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white/90 p-4 text-sm shadow-card backdrop-blur">{content.heroCard}</div>
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
            <h2 className="font-display text-3xl tracking-tight">{content.pillarsTitle}</h2>
            <p className="mt-4 leading-7 text-muted">{content.pillarsBody}</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="rounded-2xl bg-green-soft px-4 py-3">{content.humanPillar}</li>
              <li className="rounded-2xl bg-gold-soft px-4 py-3">{content.animalPillar}</li>
              <li className="rounded-2xl bg-teal-soft px-4 py-3">{content.environmentPillar}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 md:grid-cols-2 md:px-6">
        {caps.map((c, i) => {
          const Icon = ICONS[i];
          return (
            <Link key={c.href} href={c.href} className="group rounded-[28px] border border-line bg-white p-6 shadow-card transition hover:-translate-y-0.5">
              <Icon className="h-6 w-6 text-ghana-green" />
              <h3 className="mt-4 font-display text-2xl">{c.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{c.body}</p>
              <div className="mt-4 text-sm font-semibold text-ghana-green group-hover:underline">Open</div>
            </Link>
          );
        })}
        <Link href="/extracts" className="group rounded-[28px] border border-line bg-white p-6 shadow-card">
          <h3 className="font-display text-2xl">DHIMS2 / IDSR extracts</h3>
          <p className="mt-2 text-sm leading-6 text-muted">Load official weekly CSVs. Quality log, completeness, OpenRouter review, then the forecast desk uses that series.</p>
        </Link>
        <Link href="/field" className="group rounded-[28px] border border-line bg-white p-6 shadow-card">
          <h3 className="font-display text-2xl">Spoken field brief</h3>
          <p className="mt-2 text-sm leading-6 text-muted">Ninety-word CHPS card in English, Twi, Ewe, Ga or Hausa - then speak it.</p>
        </Link>
        <Link href="/climate" className="group rounded-[28px] border border-line bg-white p-6 shadow-card md:col-span-2">
          <CloudSun className="h-6 w-6 text-teal" />
          <h3 className="mt-4 font-display text-2xl">Climate desk - OpenWeather across Ghana</h3>
          <p className="mt-2 text-sm leading-6 text-muted">Rain, heat and humidity sit next to cholera and malaria watches. This is the environmental pillar, not decoration.</p>
        </Link>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <h2 className="font-display text-3xl">{content.pipelineTitle}</h2>
        <p className="mt-3 max-w-3xl text-muted">{content.pipelineBody}</p>
        <img src="/images/data-decision-pipeline.png" alt="Data to decision pipeline" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
        <img src="/images/system-architecture.png" alt="System architecture" className="mt-6 w-full rounded-[28px] border border-line bg-white shadow-card" />
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-8 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-3xl">{content.signalsTitle}</h2>
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
            <h2 className="font-display text-3xl">{content.regionsTitle}</h2>
            <p className="mt-4 text-muted leading-7">{content.regionsBody}</p>
            <p className="mt-2 text-sm text-muted">{REGIONS.length} regions on the official map.</p>
            <Link href="/regions" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ghana-green">
              Browse the regional desk <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
