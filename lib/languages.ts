export const FIELD_LANGUAGES = [
  { id: "en", label: "English", instruction: "Reply in clear professional English." },
  { id: "tw", label: "Twi", instruction: "Reply in Twi (Asante/Akuapem mix acceptable), then a short English recap." },
  { id: "ee", label: "Ewe", instruction: "Reply in Ewe, then a short English recap." },
  { id: "gaa", label: "Ga", instruction: "Reply in Ga, then a short English recap." },
  { id: "ha", label: "Hausa", instruction: "Reply in Hausa as used in northern Ghana, then a short English recap." },
];

export function languageInstruction(id?: string) {
  return FIELD_LANGUAGES.find((l) => l.id === id)?.instruction || FIELD_LANGUAGES[0].instruction;
}
