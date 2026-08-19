import { openWeatherKey } from "./env";
import { REGIONS } from "./ghana";

export interface CityWeather {
  regionId: string;
  region: string;
  city: string;
  temp: number;
  feels: number;
  humidity: number;
  rain1h: number;
  wind: number;
  description: string;
  pressure: number;
  source: string;
}

const CITIES: { regionId: string; q: string }[] = [
  { regionId: "greater-accra", q: "Accra,GH" },
  { regionId: "ashanti", q: "Kumasi,GH" },
  { regionId: "western", q: "Takoradi,GH" },
  { regionId: "central", q: "Cape Coast,GH" },
  { regionId: "eastern", q: "Koforidua,GH" },
  { regionId: "volta", q: "Ho,GH" },
  { regionId: "northern", q: "Tamale,GH" },
  { regionId: "upper-east", q: "Bolgatanga,GH" },
  { regionId: "upper-west", q: "Wa,GH" },
  { regionId: "bono", q: "Sunyani,GH" },
];

export async function ghanaWeather(): Promise<{ ok: boolean; rows: CityWeather[]; note: string }> {
  const key = openWeatherKey();
  if (!key) return { ok: false, rows: fallbackRows(), note: "OPENWEATHER_API_KEY not set - showing climatic placeholders." };

  const settled = await Promise.all(
    CITIES.map(async (c) => {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(c.q)}&appid=${key}&units=metric`;
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as {
          name?: string;
          weather?: { description?: string }[];
          main?: { temp?: number; feels_like?: number; humidity?: number; pressure?: number };
          rain?: { "1h"?: number };
          wind?: { speed?: number };
        };
        if (!res.ok) return null;
        const region = REGIONS.find((r) => r.id === c.regionId);
        const row: CityWeather = {
          regionId: c.regionId,
          region: region?.name || c.q,
          city: json.name || c.q,
          temp: json.main?.temp ?? 0,
          feels: json.main?.feels_like ?? 0,
          humidity: json.main?.humidity ?? 0,
          rain1h: json.rain?.["1h"] ?? 0,
          wind: json.wind?.speed ?? 0,
          description: json.weather?.[0]?.description || "",
          pressure: json.main?.pressure ?? 0,
          source: "openweather",
        };
        return row;
      } catch {
        return null;
      }
    }),
  );
  const rows = settled.filter((r): r is CityWeather => Boolean(r));
  const fail = CITIES.length - rows.length;
  if (!rows.length) return { ok: false, rows: fallbackRows(), note: `OpenWeather unreachable (${fail} failed).` };
  return { ok: true, rows, note: fail ? `${fail} cities failed` : "Live OpenWeather" };
}

function fallbackRows(): CityWeather[] {
  return CITIES.map((c) => {
    const region = REGIONS.find((r) => r.id === c.regionId);
    return {
      regionId: c.regionId,
      region: region?.name || c.q,
      city: c.q.split(",")[0],
      temp: 28,
      feels: 31,
      humidity: 78,
      rain1h: 0,
      wind: 3,
      description: "placeholder (connect OpenWeather)",
      pressure: 1012,
      source: "placeholder",
    };
  });
}
