/**
 * Client- and server-safe model catalogue (no server-only imports).
 *
 * PINNABLE_MODELS is the list the Agent header dropdown offers. Every slug is a
 * Google Gemini model served by the Gemini API on the single GEMINI_API_KEY.
 * When one is selected the server calls that model ALONE - no fallback chain,
 * no substitution - so the pinned version is the version that answers.
 * "Auto (fallback chain)" (empty string) walks the full chain from
 * gemini-2.5-flash down to the lightweight free-tier models.
 */

export interface ModelOption {
  slug: string;
  label: string;
  group: "Gemini 2.5" | "Gemini 2.0" | "Latest aliases" | "Gemma";
  note?: string;
}

export const PINNABLE_MODELS: ModelOption[] = [
  { slug: "gemini-2.5-flash", label: "Gemini 2.5 Flash", group: "Gemini 2.5", note: "fast + vision · default" },
  { slug: "gemini-2.5-pro", label: "Gemini 2.5 Pro", group: "Gemini 2.5", note: "deep reasoning" },
  { slug: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", group: "Gemini 2.5", note: "cheapest 2.5" },
  { slug: "gemini-2.0-flash", label: "Gemini 2.0 Flash", group: "Gemini 2.0", note: "stable + vision" },
  { slug: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite", group: "Gemini 2.0", note: "cheapest 2.0" },
  { slug: "gemini-flash-latest", label: "Gemini Flash (latest)", group: "Latest aliases", note: "always-current flash" },
  { slug: "gemini-pro-latest", label: "Gemini Pro (latest)", group: "Latest aliases", note: "always-current pro" },
  { slug: "gemma-3-27b-it", label: "Gemma 3 27B", group: "Gemma", note: "open weights · free tier" },
  { slug: "gemma-3-12b-it", label: "Gemma 3 12B", group: "Gemma", note: "open weights · light" },
];

export const PINNABLE_SLUGS = PINNABLE_MODELS.map((m) => m.slug);

/** True when the slug looks like a Gemini API model reference. */
export function isValidModelSlug(slug: string | undefined | null): slug is string {
  if (!slug) return false;
  const bare = slug.replace(/^models\//, "");
  return /^(gemini|gemma|learnlm|text-embedding|imagen)[a-z0-9._-]*$/i.test(bare);
}
