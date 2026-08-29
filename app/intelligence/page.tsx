"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { Disclaimer } from "@/components/Disclaimer";
import { KeyStatus } from "@/components/KeyStatus";
import { DISEASES, REGIONS } from "@/lib/ghana";
import { FIELD_LANGUAGES } from "@/lib/languages";
import { Mic, Search, Send, Volume2 } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

export default function IntelligencePage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "National intelligence desk for **Ghana only**. Ask for a regional malaria outlook, a cholera investigation checklist, or how to load a DHIMS2 extract. I will not invent official counts, and I will not accept patient names.",
      model: "system",
    },
  ]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("en");
  const [search, setSearch] = useState(true);
  const [diseaseId, setDiseaseId] = useState("malaria");
  const [regionId, setRegionId] = useState("national");
  const [busy, setBusy] = useState(false);
  const [keyNote, setKeyNote] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => {
        const on = j.capabilities?.openrouter;
        setKeyNote(
          on
            ? `OpenRouter key loaded (${j.capabilities.openrouterKey}). Fallback chain is live.`
            : "OPENROUTER_API_KEY is missing on the server. Chat will use the Ghana offline briefing until Render has the key.",
        );
      })
      .catch(() => setKeyNote("Could not read /api/health."));
  }, []);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next
            .filter((m) => m.role === "user" || m.model !== "system")
            .map(({ role, content }) => ({ role, content })),
          search,
          diseaseId,
          regionId,
          language,
        }),
      });
      // include full conversation except the welcome if needed
      const json = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: json.text || json.error || "No response", model: json.model },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: (e as Error).message, model: "error" }]);
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("This browser has no Web Speech API. Chrome or Edge on desktop works best. You can still type.");
      return;
    }
    if (listening && recRef.current) {
      recRef.current.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-GH";
    rec.interimResults = false;
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const t = ev.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function speak(text: string) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 1800) }),
    });
    const type = res.headers.get("content-type") || "";
    if (type.includes("audio")) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      void audio.play();
      return;
    }
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text.slice(0, 1800));
      u.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ghana-green">OpenRouter intelligence</p>
      <h1 className="font-display mt-2 text-4xl tracking-tight">Ask, speak, search - Ghana only</h1>
      <p className="mt-3 text-muted">
        One server key. OpenRouter accepts at most three fallback slugs per request - the desk walks the full chain in groups of three (4.1-mini / Flash / 4o-mini, then Claude / DeepSeek / Mistral, then :free, then auto). The chain is checked against the live OpenRouter model catalogue and retired slugs are skipped automatically, so a provider withdrawing a model never kills the desk.
      </p>
      <div className="mt-5">
        <Disclaimer compact />
      </div>
      {keyNote && <p className="mt-3 text-sm text-muted">{keyNote}</p>}
      <div className="mt-3">
        <KeyStatus compact />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select className="rounded-full border border-line bg-white px-3 py-2 text-sm" value={diseaseId} onChange={(e) => setDiseaseId(e.target.value)}>
          {DISEASES.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select className="rounded-full border border-line bg-white px-3 py-2 text-sm" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          <option value="national">National</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select className="rounded-full border border-line bg-white px-3 py-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
          {FIELD_LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSearch((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${search ? "border-ghana-green bg-green-soft" : "border-line bg-white"}`}
        >
          <Search className="h-4 w-4" /> Web search {search ? "on" : "off"}
        </button>
      </div>

      <div className="mt-6 space-y-4 rounded-[28px] border border-line bg-white p-5 shadow-card">
        {messages.map((m, i) => (
          <div key={i} className={`rounded-2xl px-4 py-3 ${m.role === "user" ? "ml-8 bg-paper" : "mr-4 bg-green-soft/50"}`}>
            <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
              <span>{m.role === "user" ? "You" : m.model || "officer"}</span>
              {m.role === "assistant" && (
                <button onClick={() => speak(m.content)} className="inline-flex items-center gap-1">
                  <Volume2 className="h-3.5 w-3.5" /> listen
                </button>
              )}
            </div>
            <Markdown text={m.content} />
          </div>
        ))}
        {busy && <div className="text-sm text-muted">Consulting the fallback chain…</div>}
        <div ref={bottom} />
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <button type="button" onClick={listen} className={`rounded-2xl border px-3 py-3 ${listening ? "border-ghana-red bg-red-soft" : "border-line bg-white"}`} aria-label="Voice">
          <Mic className="h-5 w-5" />
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="e.g. Draft a Greater Accra cholera watch for this rainy week. No patient names."
          className="flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-3 text-sm"
        />
        <button type="submit" disabled={busy} className="rounded-2xl bg-ink px-4 py-3 text-white" aria-label="Send">
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    start(): void;
    stop(): void;
    onresult: ((ev: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
  }
  interface SpeechRecognitionEvent extends Event {
    results: { [index: number]: { [index: number]: { transcript: string } } };
  }
}
