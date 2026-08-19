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

export function openRouterKey(): string {
  return (
    read("OPENROUTER_API_KEY") ||
    read("OPEN_ROUTER_API_KEY") ||
    read("OPENROUTER_KEY") ||
    read("OR_API_KEY")
  );
}

export function openRouterReferer(): string {
  return (
    read("OPENROUTER_HTTP_REFERER") ||
    read("NEXT_PUBLIC_SITE_URL") ||
    "https://one-health-ghana.onrender.com"
  );
}

export function openRouterTitle(): string {
  return read("OPENROUTER_APP_TITLE") || "ONE HEALTH GHANA";
}

export function extraOpenRouterModels(): string[] {
  const raw = read("OPENROUTER_MODELS");
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tavilyKey(): string {
  return read("TAVILY_API_KEY");
}

export function elevenLabsKey(): string {
  return read("ELEVENLABS_API_KEY");
}

export function elevenLabsVoice(): string {
  return read("ELEVENLABS_VOICE_ID") || "21m00Tcm4TlvDq8ikWAM";
}

export function openWeatherKey(): string {
  return read("OPENWEATHER_API_KEY");
}

export function siteUrl(): string {
  return read("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";
}

export function adminEmail(): string {
  return (read("ADMIN_EMAIL") || "admin@ghs.gov.gh").toLowerCase();
}

export function adminPassword(): string {
  return read("ADMIN_PASSWORD") || "GhanaHealth2026!";
}

export function adminName(): string {
  return read("ADMIN_NAME") || "GHS Administrator";
}

export function sessionSecret(): string {
  return read("SESSION_SECRET") || openRouterKey() || "one-health-ghana-dev-secret";
}

export function maskKey(value: string): string {
  if (!value) return "not set";
  if (value.length < 12) return "set ·••••";
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
