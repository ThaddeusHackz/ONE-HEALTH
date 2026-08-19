export interface District {
  id: string;
  name: string;
  regionId: string;
  scale: number;
}

/** Representative MMDAs in every region — not the full 261, which would invite small-cell risk. */
export const DISTRICTS: District[] = [
  { id: "accra-metro", name: "Accra Metro", regionId: "greater-accra", scale: 1.15 },
  { id: "tema", name: "Tema", regionId: "greater-accra", scale: 0.85 },
  { id: "ga-west", name: "Ga West", regionId: "greater-accra", scale: 0.7 },
  { id: "leda", name: "Ledzokuku", regionId: "greater-accra", scale: 0.62 },
  { id: "ashaiman", name: "Ashaiman", regionId: "greater-accra", scale: 0.58 },
  { id: "kumasi-metro", name: "Kumasi Metro", regionId: "ashanti", scale: 1.2 },
  { id: "asokwa", name: "Asokwa", regionId: "ashanti", scale: 0.55 },
  { id: "obuasim", name: "Obuasi", regionId: "ashanti", scale: 0.5 },
  { id: "ejisu", name: "Ejisu", regionId: "ashanti", scale: 0.48 },
  { id: "sekondi", name: "Sekondi-Takoradi", regionId: "western", scale: 1.05 },
  { id: "tarkwa", name: "Tarkwa-Nsuaem", regionId: "western", scale: 0.52 },
  { id: "nzema-east", name: "Nzema East", regionId: "western", scale: 0.4 },
  { id: "sefwi-wiawso", name: "Sefwi Wiawso", regionId: "western-north", scale: 0.7 },
  { id: "bibiani", name: "Bibiani-Anhwiaso-Bekwai", regionId: "western-north", scale: 0.55 },
  { id: "juaboso", name: "Juaboso", regionId: "western-north", scale: 0.42 },
  { id: "cape-coast", name: "Cape Coast Metro", regionId: "central", scale: 0.9 },
  { id: "kasoa", name: "Awutu Senya East", regionId: "central", scale: 0.8 },
  { id: "winneba", name: "Effutu", regionId: "central", scale: 0.5 },
  { id: "koforidua", name: "New Juaben South", regionId: "eastern", scale: 0.8 },
  { id: "nsawam", name: "Nsawam Adoagyiri", regionId: "eastern", scale: 0.52 },
  { id: "akosombo", name: "Asuogyaman", regionId: "eastern", scale: 0.4 },
  { id: "ho", name: "Ho Municipal", regionId: "volta", scale: 0.75 },
  { id: "keta", name: "Keta", regionId: "volta", scale: 0.48 },
  { id: "hohoe", name: "Hohoe", regionId: "volta", scale: 0.5 },
  { id: "dambai", name: "Krachi East", regionId: "oti", scale: 0.55 },
  { id: "nkwanta", name: "Nkwanta South", regionId: "oti", scale: 0.5 },
  { id: "krakye", name: "Krachi West", regionId: "oti", scale: 0.38 },
  { id: "goaso", name: "Asunafo North", regionId: "ahafo", scale: 0.6 },
  { id: "bechem", name: "Tano South", regionId: "ahafo", scale: 0.42 },
  { id: "duayaw", name: "Tano North", regionId: "ahafo", scale: 0.4 },
  { id: "sunyani", name: "Sunyani Municipal", regionId: "bono", scale: 0.78 },
  { id: "berkum", name: "Berekum East", regionId: "bono", scale: 0.48 },
  { id: "dormaa", name: "Dormaa Central", regionId: "bono", scale: 0.45 },
  { id: "techiman", name: "Techiman Municipal", regionId: "bono-east", scale: 0.82 },
  { id: "kintampo", name: "Kintampo North", regionId: "bono-east", scale: 0.5 },
  { id: "atebubu", name: "Atebubu-Amantin", regionId: "bono-east", scale: 0.42 },
  { id: "tamale", name: "Tamale Metro", regionId: "northern", scale: 1.1 },
  { id: "savelugu", name: "Savelugu", regionId: "northern", scale: 0.45 },
  { id: "yendi", name: "Yendi", regionId: "northern", scale: 0.48 },
  { id: "damongo", name: "West Gonja", regionId: "savannah", scale: 0.5 },
  { id: "buipe", name: "Central Gonja", regionId: "savannah", scale: 0.4 },
  { id: "salaga", name: "East Gonja", regionId: "savannah", scale: 0.42 },
  { id: "nalerigu", name: "East Mamprusi", regionId: "north-east", scale: 0.52 },
  { id: "gambaga", name: "West Mamprusi", regionId: "north-east", scale: 0.45 },
  { id: "walewale", name: "West Mamprusi (Walewale)", regionId: "north-east", scale: 0.4 },
  { id: "bolga", name: "Bolgatanga Municipal", regionId: "upper-east", scale: 0.85 },
  { id: "bawku", name: "Bawku Municipal", regionId: "upper-east", scale: 0.7 },
  { id: "navrongo", name: "Kassena Nankana", regionId: "upper-east", scale: 0.55 },
  { id: "wa", name: "Wa Municipal", regionId: "upper-west", scale: 0.8 },
  { id: "lawra", name: "Lawra", regionId: "upper-west", scale: 0.42 },
  { id: "tumu", name: "Sissala East", regionId: "upper-west", scale: 0.4 },
];

export function districtsFor(regionId: string): District[] {
  if (regionId === "national") return [];
  return DISTRICTS.filter((d) => d.regionId === regionId);
}

export function districtById(id?: string | null): District | null {
  if (!id) return null;
  return DISTRICTS.find((d) => d.id === id) || null;
}

export function districtCoverage() {
  const byRegion: Record<string, number> = {};
  for (const d of DISTRICTS) byRegion[d.regionId] = (byRegion[d.regionId] || 0) + 1;
  return { total: DISTRICTS.length, byRegion };
}
