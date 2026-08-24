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

export function openRouterKey(): string {
  const direct = first(
    "OPENROUTER_API_KEY",
    "OPEN_ROUTER_API_KEY",
    "OPENROUTER_KEY",
    "OR_API_KEY",
    "OPENROUTER",
  );
  if (direct) return direct;
  // Last-resort: some hosts put the sk-or key under an OpenAI-shaped name.
  const openaiShaped = first("OPENAI_API_KEY", "OPENAI_KEY");
  if (openaiShaped.startsWith("sk-or-")) return openaiShaped;
  return "";
}

export function openRouterReferer(): string {
  return (
    first("OPENROUTER_HTTP_REFERER", "NEXT_PUBLIC_SITE_URL") ||
    "https://one-health-ghana.onrender.com"
  );
}

export function openRouterTitle(): string {
  return first("OPENROUTER_APP_TITLE") || "ONE HEALTH GHANA";
}

export function extraOpenRouterModels(): string[] {
  const raw = first("OPENROUTER_MODELS", "OPENROUTER_MODEL");
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
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

/**
 * Direct OpenAI key for Whisper speech-to-text. When absent we route
 * transcription through OpenRouter's audio endpoint (same key, one bill).
 */
export function whisperKey(): string {
  const direct = first("OPENAI_API_KEY", "OPENAI_WHISPER_API_KEY", "WHISPER_API_KEY");
  // An sk-or key is not an OpenAI key - never send it to api.openai.com.
  if (direct.startsWith("sk-or-")) return "";
  return direct;
}

export function imageModels(): string[] {
  const raw = first("OPENROUTER_IMAGE_MODELS", "OPENROUTER_IMAGE_MODEL");
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
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
  return first("SESSION_SECRET") || openRouterKey() || "one-health-ghana-dev-secret";
}

export function maskKey(value: string): string {
  if (!value) return "not set";
  if (value.length < 12) return "set ·••••";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
