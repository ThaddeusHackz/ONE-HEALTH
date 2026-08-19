export interface District {
  id: string;
  name: string;
  regionId: string;
  scale: number;
}

export const DISTRICTS: District[] = [
  { id: "accra-metro", name: "Accra Metro", regionId: "greater-accra", scale: 1.15 },
  { id: "tema", name: "Tema", regionId: "greater-accra", scale: 0.85 },
  { id: "ga-west", name: "Ga West", regionId: "greater-accra", scale: 0.7 },
  { id: "leda", name: "Ledzokuku", regionId: "greater-accra", scale: 0.62 },
  { id: "kumasi-metro", name: "Kumasi Metro", regionId: "ashanti", scale: 1.2 },
  { id: "asokwa", name: "Asokwa", regionId: "ashanti", scale: 0.55 },
  { id: "obuasim", name: "Obuasi", regionId: "ashanti", scale: 0.5 },
  { id: "sekondi", name: "Sekondi-Takoradi", regionId: "western", scale: 1.05 },
  { id: "cape-coast", name: "Cape Coast Metro", regionId: "central", scale: 0.9 },
  { id: "koforidua", name: "New Juaben South", regionId: "eastern", scale: 0.8 },
  { id: "ho", name: "Ho Municipal", regionId: "volta", scale: 0.75 },
  { id: "tamale", name: "Tamale Metro", regionId: "northern", scale: 1.1 },
  { id: "bolga", name: "Bolgatanga Municipal", regionId: "upper-east", scale: 0.85 },
  { id: "wa", name: "Wa Municipal", regionId: "upper-west", scale: 0.8 },
  { id: "sunyani", name: "Sunyani Municipal", regionId: "bono", scale: 0.78 },
  { id: "techiman", name: "Techiman Municipal", regionId: "bono-east", scale: 0.82 },
];

export function districtsFor(regionId: string): District[] {
  if (regionId === "national") return [];
  return DISTRICTS.filter((d) => d.regionId === regionId);
}

export function districtById(id?: string | null): District | null {
  if (!id) return null;
  return DISTRICTS.find((d) => d.id === id) || null;
}
