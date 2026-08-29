/**
 * Client- and server-safe model catalogue (no server-only imports).
 *
 * PINNABLE_MODELS is the list the Agent header dropdown offers. When one of
 * these is selected the server sends OpenRouter that slug ALONE - no fallback
 * array, no substitution - so the pinned version is the version that answers.
 * "Auto (fallback chain)" (empty string) walks the full chain from
 * openai/gpt-4.1-mini down to the free models.
 *
 * Every slug below was verified live on OpenRouter on 2026-08-29. The retired
 * 2025 entries (anthropic/claude-3.5-sonnet, mistralai/mistral-large-2411 and
 * the legacy :free tier) were removed - pinning one of those used to answer
 * with a hard 404 "No endpoints found".
 */

export interface ModelOption {
  slug: string;
  label: string;
  group: "OpenAI" | "Google" | "Anthropic" | "DeepSeek" | "Meta" | "Mistral" | "Free";
  note?: string;
}

export const PINNABLE_MODELS: ModelOption[] = [
  { slug: "openai/gpt-4.1-mini", label: "GPT-4.1 mini", group: "OpenAI", note: "fast + cheap" },
  { slug: "openai/gpt-4.1", label: "GPT-4.1", group: "OpenAI", note: "strong reasoning" },
  { slug: "openai/gpt-4o", label: "GPT-4o", group: "OpenAI", note: "vision" },
  { slug: "openai/gpt-4o-mini", label: "GPT-4o mini", group: "OpenAI", note: "cheapest OpenAI" },
  { slug: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", group: "Google", note: "fast + vision" },
  { slug: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", group: "Google", note: "deep reasoning" },
  { slug: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", group: "Anthropic", note: "latest Sonnet" },
  { slug: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", group: "Anthropic" },
  { slug: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", group: "Anthropic", note: "fast + cheap" },
  { slug: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", group: "DeepSeek", note: "cheap near-frontier" },
  { slug: "deepseek/deepseek-chat", label: "DeepSeek Chat (V3)", group: "DeepSeek" },
  { slug: "deepseek/deepseek-r1", label: "DeepSeek R1", group: "DeepSeek", note: "reasoning" },
  { slug: "mistralai/mistral-large-2512", label: "Mistral Large 3", group: "Mistral", note: "flagship" },
  { slug: "mistralai/mistral-small-2603", label: "Mistral Small 4", group: "Mistral" },
  { slug: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2", group: "Mistral" },
  { slug: "mistralai/mistral-nemo", label: "Mistral Nemo", group: "Mistral", note: "cheapest Mistral" },
  { slug: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", group: "Meta" },
  { slug: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", group: "Free", note: "free · multimodal" },
  { slug: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super", group: "Free", note: "free · 262K ctx" },
];

export const PINNABLE_SLUGS = PINNABLE_MODELS.map((m) => m.slug);

/** True when the slug looks like an OpenRouter model reference. */
export function isValidModelSlug(slug: string | undefined | null): slug is string {
  if (!slug) return false;
  return /^[a-z0-9][a-z0-9._\/-]*\/[a-z0-9][a-z0-9._\/-]*(:[a-z0-9._-]+)?$/i.test(slug);
}
