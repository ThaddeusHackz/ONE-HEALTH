import { completeWithSystem, openRouterConfigured } from "./openrouter";

export async function openRouterReview(kind: string, payload: unknown): Promise<{ text: string; model: string }> {
  if (!openRouterConfigured()) {
    return { text: "", model: "offline" };
  }
  const prompts: Record<string, string> = {
    dhims2:
      "You are a Ghana Health Service DHIMS2 data manager. Using ONLY the quality object and week counts, write 120 words: fitness for a 4-week forecast, what is missing, and 3 cleaning actions. Do not invent official circulars. Never claim the extract is error-free.",
    nowcast:
      "You are a Ghana epidemiologist. Explain this reporting-delay nowcast in 100 words for a district director. Stress that last weeks are incomplete reports, not necessarily a true drop. Prefer the interval.",
    audit:
      "Summarise this audit pack in 120 words for the One Health Secretariat: volumes, last actions, any redaction counts. No patient identifiers.",
  };
  try {
    const r = await completeWithSystem({
      extraSystem: prompts[kind] || "Review this Ghana Health Service artefact. Be precise. No certainty claims.",
      user: JSON.stringify(payload).slice(0, 12000),
      temperature: 0.2,
    });
    return { text: r.text, model: r.model };
  } catch (err) {
    return { text: "", model: `review-failed: ${(err as Error).message}` };
  }
}
