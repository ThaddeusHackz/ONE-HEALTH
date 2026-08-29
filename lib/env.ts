function read(name: string): string {
  let value = (process.env[name] || "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(value)) value = value.replace(/^bearer\s+/i, "").trim();
  return value;
}

function first(...names: string[]): string {
  for (const name of names) {
    const value = read(name);
    if (value) return value;
  }
  return "";
}

/**
 * THE key. GEMINI_API_KEY (Google AI Studio - https://aistudio.google.com/apikey)
 * is the single engine credential for this platform: chat and reasoning,
 * agentic tool calling, vision (photos, PDFs, documents), deep research,
 * image generation, speech-to-text and text-to-speech all run on it.
 *
 * A legacy OpenRouter key (sk-or-…) is NOT a Google key and is never sent to
 * Google, no matter which variable it was pasted into.
 */
export function geminiKey(): string {
  const direct = first(
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_KEY",
    "GOOGLE_GENAI_KEY",
    "GOOGLE_AI_STUDIO_API_KEY",
  );
  if (direct.startsWith("sk-or-")) return "";
  return direct;
}

/** Optional comma-separated Gemini text/vision model slugs tried before the built-in chain. */
export function extraGeminiModels(): string[] {
  const raw = first("GEMINI_MODELS", "GEMINI_MODEL", "GEMINI_TEXT_MODELS");
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^models\//, ""))
    .filter(Boolean);
}

/** Optional comma-separated Gemini image model slugs tried before the built-in chain. */
export function geminiImageModels(): string[] {
  const raw = first("GEMINI_IMAGE_MODELS", "GEMINI_IMAGE_MODEL");
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^models\//, ""))
    .filter(Boolean);
}

/** Optional prebuilt Gemini TTS voice (see ai.google.dev speech generation docs). */
export function geminiVoice(): string {
  return first("GEMINI_TTS_VOICE", "GEMINI_VOICE") || "Kore";
}

export function tavilyKey(): string {
  return first("TAVILY_API_KEY", "TAVILY_KEY", "SEARCH_API_KEY");
}

export function elevenLabsKey(): string {
  return first("ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY", "ELEVENLABS_KEY", "XI_API_KEY");
}

export function elevenLabsVoice(): string {
  return first("ELEVENLABS_VOICE_ID", "ELEVEN_LABS_VOICE_ID") || "21m00Tcm4TlvDq8ikWAM";
}

export function unsplashKey(): string {
  return first("UNSPLASH_ACCESS_KEY", "UNSPLASH_API_KEY", "UNSPLASH_KEY");
}

export function agentMaxSteps(): number {
  const raw = Number(first("AGENT_MAX_STEPS"));
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.round(raw), 24) : 8;
}

export function openWeatherKey(): string {
  return first(
    "OPENWEATHER_API_KEY",
    "OPENWEATHERMAP_API_KEY",
    "OPEN_WEATHER_API_KEY",
    "WEATHER_API_KEY",
  );
}

export function siteUrl(): string {
  return first("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
}

export function adminEmail(): string {
  return (first("ADMIN_EMAIL") || "admin@ghs.gov.gh").toLowerCase();
}

export function adminPassword(): string {
  return first("ADMIN_PASSWORD") || "GhanaHealth2026!";
}

export function adminName(): string {
  return first("ADMIN_NAME") || "GHS Administrator";
}

export function sessionSecret(): string {
  return first("SESSION_SECRET") || geminiKey() || "one-health-ghana-dev-secret";
}

export function maskKey(value: string): string {
  if (!value) return "not set";
  if (value.length < 12) return "set ·••••";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
