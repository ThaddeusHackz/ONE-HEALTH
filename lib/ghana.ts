export type Pillar = "human" | "animal" | "environment";

export interface Disease {
  id: string;
  name: string;
  short: string;
  pillar: Pillar;
  group: string;
  description: string;
  seasonality: string;
  regionsOfConcern: string[];
  unit: string;
}

export interface Region {
  id: string;
  name: string;
  zone: "Coastal" | "Forest" | "Transition" | "Savannah";
  capital: string;
  population: number;
  facilities: number;
}

export const REGIONS: Region[] = [
  { id: "greater-accra", name: "Greater Accra", zone: "Coastal", capital: "Accra", population: 5455692, facilities: 812 },
  { id: "ashanti", name: "Ashanti", zone: "Forest", capital: "Kumasi", population: 5440463, facilities: 764 },
  { id: "western", name: "Western", zone: "Coastal", capital: "Sekondi-Takoradi", population: 2060585, facilities: 318 },
  { id: "western-north", name: "Western North", zone: "Forest", capital: "Sefwi Wiawso", population: 880921, facilities: 164 },
  { id: "central", name: "Central", zone: "Coastal", capital: "Cape Coast", population: 2859821, facilities: 392 },
  { id: "eastern", name: "Eastern", zone: "Forest", capital: "Koforidua", population: 2925653, facilities: 441 },
  { id: "volta", name: "Volta", zone: "Coastal", capital: "Ho", population: 1659822, facilities: 276 },
  { id: "oti", name: "Oti", zone: "Transition", capital: "Dambai", population: 747227, facilities: 128 },
  { id: "ahafo", name: "Ahafo", zone: "Forest", capital: "Goaso", population: 564668, facilities: 102 },
  { id: "bono", name: "Bono", zone: "Transition", capital: "Sunyani", population: 1208649, facilities: 198 },
  { id: "bono-east", name: "Bono East", zone: "Transition", capital: "Techiman", population: 1203440, facilities: 176 },
  { id: "northern", name: "Northern", zone: "Savannah", capital: "Tamale", population: 2313104, facilities: 287 },
  { id: "savannah", name: "Savannah", zone: "Savannah", capital: "Damongo", population: 653266, facilities: 96 },
  { id: "north-east", name: "North East", zone: "Savannah", capital: "Nalerigu", population: 658946, facilities: 88 },
  { id: "upper-east", name: "Upper East", zone: "Savannah", capital: "Bolgatanga", population: 1301094, facilities: 214 },
  { id: "upper-west", name: "Upper West", zone: "Savannah", capital: "Wa", population: 901502, facilities: 167 },
];

export const NATIONAL: Region = {
  id: "national",
  name: "National (all regions)",
  zone: "Forest",
  capital: "Accra",
  population: REGIONS.reduce((s, r) => s + r.population, 0),
  facilities: REGIONS.reduce((s, r) => s + r.facilities, 0),
};

export const DISEASES: Disease[] = [
  {
    id: "malaria",
    name: "Malaria",
    short: "Confirmed malaria cases",
    pillar: "human",
    group: "Vector-borne",
    description: "Ghana’s highest-burden notifiable disease. Transmission rises with rainfall and standing water, especially in forest and savannah belts.",
    seasonality: "Peaks during and just after the major rains (May-October).",
    regionsOfConcern: ["northern", "upper-east", "upper-west", "ashanti", "western"],
    unit: "confirmed cases / week",
  },
  {
    id: "cholera",
    name: "Cholera",
    short: "Suspected cholera",
    pillar: "human",
    group: "WASH / enteric",
    description: "Explosive outbreak potential in dense coastal settlements when water and sanitation fail. Highly sensitive to flooding.",
    seasonality: "Rainy-season spikes; long quiet baselines between outbreaks.",
    regionsOfConcern: ["greater-accra", "central", "western", "volta"],
    unit: "suspected cases / week",
  },
  {
    id: "measles",
    name: "Measles",
    short: "Suspected measles",
    pillar: "human",
    group: "Vaccine-preventable",
    description: "Signals immunity gaps. Clusters often follow delayed supplemental immunisation or displaced communities.",
    seasonality: "Late dry season into early rains.",
    regionsOfConcern: ["northern", "north-east", "savannah", "oti"],
    unit: "suspected cases / week",
  },
  {
    id: "csm",
    name: "Cerebrospinal meningitis",
    short: "CSM",
    pillar: "human",
    group: "Meningitis belt",
    description: "Northern Ghana sits in the African meningitis belt. Dry harmattan dust and crowding raise risk.",
    seasonality: "December-April harmattan peak in savannah regions.",
    regionsOfConcern: ["upper-east", "upper-west", "north-east", "northern", "savannah"],
    unit: "suspected cases / week",
  },
  {
    id: "yellow-fever",
    name: "Yellow fever",
    short: "Yellow fever",
    pillar: "human",
    group: "Arbovirus",
    description: "Sylvatic and urban cycles. Forest-edge districts and low vaccination coverage are the watchpoints.",
    seasonality: "Rainy-season vector abundance.",
    regionsOfConcern: ["western", "western-north", "ahafo", "bono", "eastern"],
    unit: "suspected cases / week",
  },
  {
    id: "covid19",
    name: "COVID-19",
    short: "COVID-19",
    pillar: "human",
    group: "Respiratory",
    description: "Now an endemic respiratory pathogen. Useful historical series for teaching chronological forecasting.",
    seasonality: "Wave-like, less strictly seasonal than malaria.",
    regionsOfConcern: ["greater-accra", "ashanti", "western"],
    unit: "reported cases / week",
  },
  {
    id: "ili",
    name: "Influenza-like illness",
    short: "ILI",
    pillar: "human",
    group: "Respiratory",
    description: "Sentinel ILI/SARI is the practical early window on respiratory virus circulation.",
    seasonality: "Cooler months and school-term mixing.",
    regionsOfConcern: ["greater-accra", "ashanti", "central"],
    unit: "ILI visits / week",
  },
  {
    id: "mpox",
    name: "Mpox",
    short: "Mpox",
    pillar: "human",
    group: "Zoonosis",
    description: "Classic One Health pathogen. Human cases sit on a wildlife-market-household interface.",
    seasonality: "Irregular; event-driven.",
    regionsOfConcern: ["western", "central", "eastern", "ashanti"],
    unit: "suspected cases / week",
  },
  {
    id: "lassa",
    name: "Lassa fever",
    short: "Lassa",
    pillar: "human",
    group: "Zoonosis",
    description: "Mastomys rodent reservoir. Risk rises with harvest storage and poor food protection.",
    seasonality: "Dry-season rodent intrusion into homes.",
    regionsOfConcern: ["volta", "oti", "eastern", "ahafo"],
    unit: "suspected cases / week",
  },
  {
    id: "tb",
    name: "Tuberculosis",
    short: "TB notifications",
    pillar: "human",
    group: "Chronic infectious",
    description: "Slower signal. Useful for health-system load rather than outbreak spikes.",
    seasonality: "Weak seasonality; reporting-calendar effects matter.",
    regionsOfConcern: ["greater-accra", "ashanti", "western"],
    unit: "notifications / week",
  },
  {
    id: "avian-influenza",
    name: "Avian influenza",
    short: "HPAI (poultry)",
    pillar: "animal",
    group: "Zoonosis",
    description: "Veterinary Services signal. Live-bird markets and backyard flocks are the human interface.",
    seasonality: "Cooler months and migratory-bird windows.",
    regionsOfConcern: ["greater-accra", "volta", "central", "ashanti"],
    unit: "affected flocks / week",
  },
  {
    id: "anthrax",
    name: "Anthrax",
    short: "Anthrax",
    pillar: "animal",
    group: "Zoonosis",
    description: "Livestock deaths plus human cutaneous cases after butchering. Classic One Health alert pair.",
    seasonality: "Late dry season when animals graze closer to soil spores.",
    regionsOfConcern: ["upper-east", "upper-west", "savannah", "northern"],
    unit: "animal + human signals / week",
  },
  {
    id: "flood-risk",
    name: "Flood-linked health risk",
    short: "Flood risk index",
    pillar: "environment",
    group: "Climate",
    description: "Composite environmental pressure (rainfall anomaly + floodplain density) that precedes cholera and malaria upticks.",
    seasonality: "Major and minor rainy seasons.",
    regionsOfConcern: ["greater-accra", "volta", "northern", "central"],
    unit: "risk index (0-100)",
  },
];

export function regionById(id: string): Region {
  if (id === "national") return NATIONAL;
  return REGIONS.find((r) => r.id === id) || NATIONAL;
}

export function diseaseById(id: string): Disease {
  return DISEASES.find((d) => d.id === id) || DISEASES[0];
}

export const GHANA_CONTEXT = `
You are the national One Health intelligence officer for GHANA ONLY.

Scope lock:
- Ghana Health Service (GHS), Ministry of Health, Veterinary Services Directorate, Environmental Protection Authority, Noguchi Memorial Institute for Medical Research, and the Ghana One Health Secretariat.
- Sixteen regions of Ghana. Do not pivot to other countries unless the user is comparing a Ghana-relevant imported risk (e.g. a neighbouring outbreak that could cross a border).
- Priority diseases: malaria, cholera, measles, cerebrospinal meningitis, yellow fever, COVID-19, influenza-like illness, mpox, Lassa, TB, avian influenza, anthrax, plus climate-linked flood risk.

Scientific honesty (non-negotiable):
- Forecasts are probabilistic decision-support, never certainty, never “without error”.
- An alert is a prompt to investigate, not a confirmed outbreak.
- Feature importance is not causation.
- Never invent official GHS circulars, case counts, or lab results. If you lack a number, say so and show how to obtain it (DHIMS2, IDSR, VSD, NADMO, Ghana Meteorological Agency).
- Never request, store, or repeat patient-identifiable information. Work only with aggregated or de-identified material.
- If a user uploads a document or photo, describe what is visible, extract structured fields, and flag uncertainty. Do not diagnose an individual patient as if you were their clinician.

Voice: precise, calm, Ghana-public-health professional. Prefer SI units, weekly horizons, and regional language (district, region, teaching hospital, CHPS compound).
`;
