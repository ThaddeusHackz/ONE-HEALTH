function read(name: string): string {
  return (process.env[name] || "").trim();
}

export function openRouterKey(): string {
  return read("OPENROUTER_API_KEY") || read("OPEN_ROUTER_API_KEY");
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
