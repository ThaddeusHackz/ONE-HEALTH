export interface NavItem {
  href: string;
  label: string;
  visible: boolean;
}

export interface SiteContent {
  brandEyebrow: string;
  brandName: string;
  announcement: string;
  announcementOn: boolean;
  heroKicker: string;
  heroTitle: string;
  heroBody: string;
  heroPrimary: string;
  heroSecondary: string;
  heroCard: string;
  pillarsTitle: string;
  pillarsBody: string;
  humanPillar: string;
  animalPillar: string;
  environmentPillar: string;
  pipelineTitle: string;
  pipelineBody: string;
  signalsTitle: string;
  regionsTitle: string;
  regionsBody: string;
  footerBlurb: string;
  partners: string;
  disclaimer: string;
  colorGreen: string;
  colorGold: string;
  colorRed: string;
  colorTeal: string;
  colorInk: string;
}

export const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Home", visible: true },
  { href: "/agent", label: "AI Agent", visible: true },
  { href: "/forecast", label: "Forecast", visible: true },
  { href: "/surveillance", label: "Surveillance", visible: true },
  { href: "/climate", label: "Climate", visible: true },
  { href: "/intelligence", label: "Intelligence", visible: true },
  { href: "/vision", label: "Vision Lab", visible: true },
  { href: "/regions", label: "Regions", visible: true },
  { href: "/extracts", label: "Extracts", visible: true },
  { href: "/field", label: "Field brief", visible: true },
  { href: "/workbook", label: "Workbook", visible: true },
];

export const DEFAULT_CONTENT: SiteContent = {
  brandEyebrow: "Ghana Health Service",
  brandName: "ONE HEALTH",
  announcement: "Decision support only - forecasts are intervals, never certainty. An alert is not a confirmed outbreak.",
  announcementOn: true,
  heroKicker: "Ghana only · 2026 command layer",
  heroTitle: "See the next month of Ghana’s health - with the humility of an interval.",
  heroBody:
    "ONE HEALTH GHANA turns surveillance files, photographs, and weekly counts into probabilistic forecasts for the Ghana Health Service. Human, animal, and environmental signals share one white desk.",
  heroPrimary: "Open forecast desk",
  heroSecondary: "Read the modified workbook",
  heroCard: "16 regions · One Health signals · Gemini fallback chain · voice, vision, search, climate",
  pillarsTitle: "Three pillars, one Ghana desk",
  pillarsBody:
    "Most emerging infections start where people, animals, and the environment meet - live-bird markets in Accra, rodent harvest stores in Oti, flood water in Odaw, harmattan dust in the Upper East.",
  humanPillar: "Human - GHS / IDSR / DHIMS2. Notifiable diseases, ILI, facility load.",
  animalPillar: "Animal - Veterinary Services. HPAI flocks, anthrax carcasses, abortive events.",
  environmentPillar: "Environment - EPA / GMet / NADMO / OpenWeather. Flood index, rainfall, heat.",
  pipelineTitle: "How a number is born",
  pipelineBody: "Copied from the Phase 2 workbook, then made operational for Ghana. Every arrow can introduce error.",
  signalsTitle: "Priority signals",
  regionsTitle: "16 regions, one national roll-up",
  regionsBody:
    "Start national, then drop to Greater Accra cholera or Upper East CSM. The production unit of analysis is a Ghana region-week.",
  footerBlurb:
    "Decision support for the Ghana Health Service. Forecasts are probabilistic. Alerts are investigation prompts, not confirmed outbreaks.",
  partners:
    "Ghana Health Service · Ministry of Health · Veterinary Services Directorate · EPA · Noguchi Memorial Institute · One Health Secretariat · NADMO · Ghana Meteorological Agency",
  disclaimer:
    "This platform cannot produce an error-free future. Every number is a model statement with an interval. Reporting delays, testing changes, and missing weeks bias the history. Field epidemiology remains mandatory.",
  colorGreen: "#0b7a43",
  colorGold: "#e8b923",
  colorRed: "#c8102e",
  colorTeal: "#0e7490",
  colorInk: "#0b1220",
};

export const DEFAULT_KNOWLEDGE = [
  {
    id: "idsr",
    title: "IDSR in Ghana",
    body: "Integrated Disease Surveillance and Response is how GHS districts report notifiable diseases. This desk consumes weekly aggregates, never patient folders.",
  },
  {
    id: "one-health",
    title: "One Health Secretariat",
    body: "Human, animal and environmental streams must be read together. HPAI, anthrax, Lassa and cholera are interface problems.",
  },
  {
    id: "limits",
    title: "What the model must never claim",
    body: "No error-free forecast. No individual diagnosis from a photo. No outbreak confirmation from a z-score. No patient identifiers in prompts.",
  },
];
