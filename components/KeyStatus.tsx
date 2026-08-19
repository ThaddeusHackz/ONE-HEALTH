"use client";

import { useEffect, useState } from "react";

interface Caps {
  openrouter?: boolean;
  openrouterKey?: string;
  lastOpenRouterError?: string | null;
  search?: boolean;
  voice?: boolean;
  weather?: boolean;
}

export function KeyStatus({ compact = false }: { compact?: boolean }) {
  const [caps, setCaps] = useState<Caps | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setCaps(j.capabilities || {}))
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <p className="text-sm text-ghana-red">Could not read /api/health: {err}</p>;
  if (!caps) return <p className="text-sm text-muted">Checking server keys…</p>;

  const pills = [
    ["OpenRouter", caps.openrouter, caps.openrouterKey],
    ["Tavily", caps.search, "search"],
    ["OpenWeather", caps.weather, "weather"],
    ["ElevenLabs", caps.voice, "voice"],
  ] as const;

  return (
    <div className={compact ? "" : "rounded-2xl border border-line bg-white px-4 py-3"}>
      <div className="flex flex-wrap gap-2">
        {pills.map(([label, on, extra]) => (
          <span
            key={label}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              on ? "bg-green-soft text-ghana-green" : "bg-gold-soft text-ink"
            }`}
          >
            {label} {on ? "live" : "offline"}
            {label === "OpenRouter" && on && extra ? ` · ${extra}` : ""}
          </span>
        ))}
      </div>
      {!compact && caps.lastOpenRouterError && (
        <p className="mt-2 text-xs text-ghana-red">{caps.lastOpenRouterError}</p>
      )}
    </div>
  );
}
