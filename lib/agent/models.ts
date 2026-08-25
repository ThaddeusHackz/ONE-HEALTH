/**
 * Client- and server-safe model catalogue (no server-only imports).
 *
 * PINNABLE_MODELS is the list the Agent header dropdown offers. When one of
 * these is selected the server sends OpenRouter that slug ALONE - no fallback
 * array, no substitution - so the pinned version is the version that answers.
 * "Auto (fallback chain)" (empty string) walks the full chain from
 * openai/gpt-4.1-mini down to the free models.
 */

export interface ModelOption {
  slug: string;
  label: string;
  group: "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Meta" | "Mistral";
  note?: string;
}

export const PINNABLE_MODELS: ModelOption[] = [
  { slug: "openai/gpt-4.1-mini", label: "GPT-4.1 mini", group: "OpenAI", note: "fast + cheap" },
  { slug: "openai/gpt-4o", label: "GPT-4o", group: "OpenAI", note: "vision" },
  { slug: "openai/gpt-4.1", label: "GPT-4.1", group: "OpenAI", note: "strong reasoning" },
  { slug: "openai/gpt-4o-mini", label: "GPT-4o mini", group: "OpenAI", note: "cheapest OpenAI" },
  { slug: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", group: "Google", note: "fast + vision" },
  { slug: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", group: "Google", note: "deep reasoning" },
  { slug: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", group: "Anthropic" },
  { slug: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", group: "Anthropic" },
  { slug: "deepseek/deepseek-chat", label: "DeepSeek Chat", group: "DeepSeek" },
  { slug: "deepseek/deepseek-r1", label: "DeepSeek R1", group: "DeepSeek", note: "reasoning" },
  { slug: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", group: "Meta", note: "free" },
  { slug: "google/gemma-3-27b-it:free", label: "Gemma 3 27B", group: "Google", note: "free" },
  { slug: "mistralai/mistral-large-2411", label: "Mistral Large", group: "Mistral" },
];

export const PINNABLE_SLUGS = PINNABLE_MODELS.map((m) => m.slug);

/** True when the slug looks like an OpenRouter model reference. */
export function isValidModelSlug(slug: string | undefined | null): slug is string {
  if (!slug) return false;
  return /^[a-z0-9][a-z0-9._\/-]*\/[a-z0-9][a-z0-9._\/-]*(:[a-z0-9._-]+)?$/i.test(slug);
}
