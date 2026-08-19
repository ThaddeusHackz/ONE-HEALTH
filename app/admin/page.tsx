"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CONTENT, type NavItem, type SiteContent } from "@/lib/cms";
import type { ActivityRow, ChatRow, DocumentRow, ForecastRow, KnowledgeItem } from "@/lib/records";

type Tab = "dashboard" | "content" | "appearance" | "nav" | "knowledge" | "documents" | "chats" | "forecasts" | "keys";

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [me, setMe] = useState<{ email: string; name: string } | null>(null);
  const [content, setContent] = useState<SiteContent>(DEFAULT_CONTENT);
  const [nav, setNav] = useState<NavItem[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [checks, setChecks] = useState<{ id: string; ok: boolean; status: number | string; detail: string; masked: string }[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const meRes = await fetch("/api/admin/me");
    if (!meRes.ok) {
      router.push("/admin/login");
      return;
    }
    setMe(await meRes.json());
    const cms = await fetch("/api/admin/cms").then((r) => r.json());
    setContent({ ...DEFAULT_CONTENT, ...cms.content });
    setNav(cms.nav || []);
    setKnowledge(cms.knowledge || []);
    setDocuments(cms.documents || []);
    setChats(cms.chats || []);
    setForecasts(cms.forecasts || []);
    setActivity(cms.activity || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(partial: { content?: SiteContent; nav?: NavItem[]; knowledge?: KnowledgeItem[] }) {
    setMsg("Saving…");
    const res = await fetch("/api/admin/cms", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    setMsg(res.ok ? "Saved — public site will pick this up on refresh." : "Save failed");
    await load();
  }

  async function remove(kind: string, id: string) {
    await fetch(`/api/admin/cms?kind=${kind}&id=${id}`, { method: "DELETE" });
    await load();
  }

  async function probe() {
    setMsg("Probing providers…");
    const json = await fetch("/api/diagnostics").then((r) => r.json());
    setChecks(json.checks || []);
    setMsg("Diagnostics complete");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "content", label: "Copy" },
    { id: "appearance", label: "Appearance" },
    { id: "nav", label: "Navigation" },
    { id: "knowledge", label: "Knowledge" },
    { id: "documents", label: "Documents" },
    { id: "chats", label: "Intelligence" },
    { id: "forecasts", label: "Forecasts" },
    { id: "keys", label: "API desk" },
  ];

  const fields: (keyof SiteContent)[] = [
    "brandEyebrow", "brandName", "announcement", "heroKicker", "heroTitle", "heroBody",
    "heroPrimary", "heroSecondary", "heroCard", "pillarsTitle", "pillarsBody",
    "humanPillar", "animalPillar", "environmentPillar", "pipelineTitle", "pipelineBody",
    "signalsTitle", "regionsTitle", "regionsBody", "footerBlurb", "partners", "disclaimer",
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] gap-0 bg-paper">
      <aside className="w-56 shrink-0 border-r border-line bg-white p-4">
        <div className="font-display text-xl">CMS</div>
        <div className="mt-1 text-[11px] text-muted">{me?.email}</div>
        <nav className="mt-6 space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`block w-full rounded-xl px-3 py-2 text-left text-sm ${tab === t.id ? "bg-ink text-white" : "hover:bg-paper"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          className="mt-8 text-xs text-muted"
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST" });
            router.push("/admin/login");
          }}
        >
          Sign out
        </button>
      </aside>
      <section className="flex-1 p-6 md:p-10">
        {msg && <div className="mb-4 rounded-2xl bg-green-soft px-4 py-2 text-sm">{msg}</div>}

        {tab === "dashboard" && (
          <div>
            <h1 className="font-display text-3xl">National desk</h1>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              {[
                ["Documents", documents.length],
                ["Conversations", chats.length],
                ["Forecasts", forecasts.length],
                ["Knowledge", knowledge.length],
              ].map(([l, n]) => (
                <div key={String(l)} className="rounded-3xl border border-line bg-white p-5">
                  <div className="text-xs uppercase text-muted">{l}</div>
                  <div className="font-display text-3xl">{n}</div>
                </div>
              ))}
            </div>
            <a href="/api/admin/audit" className="mt-6 inline-block rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
              Download signed audit pack
            </a>
            <h2 className="mt-8 font-semibold">Recent activity</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {activity.map((a) => (
                <li key={a.id} className="rounded-2xl border border-line bg-white px-4 py-2">
                  <span className="text-muted">{a.at.slice(0, 19)}</span> · {a.actor} · {a.action} · {a.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "content" && (
          <div>
            <h1 className="font-display text-3xl">Every public sentence</h1>
            <div className="mt-6 space-y-3">
              {fields.map((key) => (
                <label key={key} className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  {key}
                  <textarea
                    className="mt-1 w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink"
                    rows={key.toLowerCase().includes("body") || key === "disclaimer" || key === "partners" ? 4 : 2}
                    value={String(content[key] || "")}
                    onChange={(e) => setContent({ ...content, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={content.announcementOn} onChange={(e) => setContent({ ...content, announcementOn: e.target.checked })} />
                Show announcement bar
              </label>
              <button onClick={() => void save({ content })} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
                Publish copy
              </button>
            </div>
          </div>
        )}

        {tab === "appearance" && (
          <div>
            <h1 className="font-display text-3xl">Colours</h1>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(["colorGreen", "colorGold", "colorRed", "colorTeal", "colorInk"] as const).map((key) => (
                <label key={key} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
                  <input type="color" value={content[key]} onChange={(e) => setContent({ ...content, [key]: e.target.value })} />
                  <span className="text-sm">{key} · {content[key]}</span>
                </label>
              ))}
            </div>
            <button onClick={() => void save({ content })} className="mt-6 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
              Publish colours
            </button>
          </div>
        )}

        {tab === "nav" && (
          <div>
            <h1 className="font-display text-3xl">Navigation</h1>
            <div className="mt-6 space-y-2">
              {nav.map((item, i) => (
                <div key={item.href} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3">
                  <input className="rounded-xl border border-line px-2 py-1 text-sm" value={item.label} onChange={(e) => {
                    const next = [...nav];
                    next[i] = { ...item, label: e.target.value };
                    setNav(next);
                  }} />
                  <input className="rounded-xl border border-line px-2 py-1 text-sm" value={item.href} onChange={(e) => {
                    const next = [...nav];
                    next[i] = { ...item, href: e.target.value };
                    setNav(next);
                  }} />
                  <label className="text-sm">
                    <input type="checkbox" checked={item.visible} onChange={(e) => {
                      const next = [...nav];
                      next[i] = { ...item, visible: e.target.checked };
                      setNav(next);
                    }} /> visible
                  </label>
                </div>
              ))}
              <button
                className="text-sm text-ghana-green"
                onClick={() => setNav([...nav, { href: "/new", label: "New page", visible: true }])}
              >
                + Add link
              </button>
              <div>
                <button onClick={() => void save({ nav })} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
                  Publish navigation
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "knowledge" && (
          <div>
            <h1 className="font-display text-3xl">Knowledge base</h1>
            <div className="mt-6 space-y-4">
              {knowledge.map((k, i) => (
                <div key={k.id} className="rounded-3xl border border-line bg-white p-4">
                  <input className="w-full rounded-xl border border-line px-3 py-2 text-sm font-semibold" value={k.title} onChange={(e) => {
                    const next = [...knowledge];
                    next[i] = { ...k, title: e.target.value };
                    setKnowledge(next);
                  }} />
                  <textarea className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-sm" rows={4} value={k.body} onChange={(e) => {
                    const next = [...knowledge];
                    next[i] = { ...k, body: e.target.value };
                    setKnowledge(next);
                  }} />
                  <button className="mt-2 text-xs text-ghana-red" onClick={() => void remove("knowledge", k.id)}>Delete</button>
                </div>
              ))}
              <button className="text-sm text-ghana-green" onClick={() => setKnowledge([...knowledge, { id: `k_${Date.now()}`, title: "New note", body: "" }])}>
                + Article
              </button>
              <div>
                <button onClick={() => void save({ knowledge })} className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
                  Publish knowledge
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div>
            <h1 className="font-display text-3xl">Stored artefacts</h1>
            <div className="mt-6 space-y-3">
              {documents.map((d) => (
                <article key={d.id} className="rounded-3xl border border-line bg-white p-4 text-sm">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs text-muted">{d.createdAt} · {d.kind} · {d.model} · {Math.round(d.size / 1024)} KB</div>
                  <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-muted">{d.analysis.slice(0, 600)}</p>
                  <button className="mt-2 text-xs text-ghana-red" onClick={() => void remove("documents", d.id)}>Delete</button>
                </article>
              ))}
              {!documents.length && <p className="text-sm text-muted">Vision Lab uploads land here.</p>}
            </div>
          </div>
        )}

        {tab === "chats" && (
          <div>
            <h1 className="font-display text-3xl">Intelligence log</h1>
            <div className="mt-6 space-y-3">
              {chats.map((c) => (
                <article key={c.id} className="rounded-3xl border border-line bg-white p-4 text-sm">
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-xs text-muted">{c.createdAt} · {c.model}</div>
                  <p className="mt-2 text-muted">{c.messages.length} turns</p>
                  <button className="mt-2 text-xs text-ghana-red" onClick={() => void remove("chats", c.id)}>Delete</button>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "forecasts" && (
          <div>
            <h1 className="font-display text-3xl">Forecast runs</h1>
            <div className="mt-6 space-y-3">
              {forecasts.map((f) => (
                <article key={f.id} className="rounded-3xl border border-line bg-white p-4 text-sm">
                  <div className="font-semibold">{f.diseaseId} · {f.regionId}</div>
                  <div className="text-xs text-muted">{f.createdAt} · latest {f.latest} · next {f.nextWeek.toFixed(0)} · z {f.z}</div>
                  <p className="mt-2 text-muted">{f.summary.slice(0, 280)}</p>
                  <button className="mt-2 text-xs text-ghana-red" onClick={() => void remove("forecasts", f.id)}>Delete</button>
                </article>
              ))}
            </div>
          </div>
        )}

        {tab === "keys" && (
          <div>
            <h1 className="font-display text-3xl">Provider desk</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Keys live only in server environment variables. This probe never prints a full secret. This sandbox may block outbound TLS — Render will not.
            </p>
            <button onClick={() => void probe()} className="mt-4 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white">
              Test OpenRouter, Tavily, OpenWeather, ElevenLabs
            </button>
            <div className="mt-6 space-y-3">
              {checks.map((c) => (
                <div key={c.id} className="rounded-3xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize">{c.id}</span>
                    <span className={c.ok ? "text-ghana-green" : "text-ghana-red"}>{c.ok ? "live" : "fail"} · {c.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{c.masked}</div>
                  <div className="mt-2 text-sm">{c.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
