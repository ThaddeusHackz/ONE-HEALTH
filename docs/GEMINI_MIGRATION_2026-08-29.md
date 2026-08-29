# Forensic scan + total migration to a single Gemini engine — 2026-08-29

**Requirement:** every file and every feature that used the OpenRouter API key must use
the **Gemini API key** instead. No OpenRouter key, slug, env var, header, URL or code
path may survive anywhere in the product.

**Verdict: done, and mechanically enforced.**

| Gate | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors |
| `npm run selftest:agent` | **all agent self-tests passed** |
| `npm run selftest` (live HTTP, production build) | **all selftests passed** |
| `npm run forensic` | **42 checks passed — NO ERRORS** |
| `npm run build` | succeeds |

A self-test now walks every `.ts`/`.tsx` file under `lib/`, `app/` and `components/`,
plus `render.yaml` and `.env.example`, and **fails the build** if the string
`openrouter` appears anywhere. The single deliberate exception is `lib/env.ts`, which
rejects a pasted `sk-or-…` key with a helpful message instead of failing silently.

---

## 1. What was found

The platform ran on **two independent keys with two different wire protocols**:

- `OPENROUTER_API_KEY` — chat, the agentic loop, tool calling, streaming, briefings,
  forecasts, field briefs, search, nowcast/series review, speech-to-text, text-to-speech.
- `GEMINI_API_KEY` — vision, deep research, image generation only.

That meant: two bills, two quotas, two failure modes, two sets of model slugs to keep
alive, and a UI that had to explain which half of the product was down. `lib/openrouter.ts`
(the OpenAI-compatible router with 3-slug-per-request chunking) and `lib/or-review.ts`
were the roots of the OpenRouter half.

## 2. What was done

`lib/openrouter.ts` and `lib/or-review.ts` were **deleted** (`git rm`) and replaced by:

- **`lib/llm.ts` — the one engine.** A Gemini-native router: model chain, live catalogue
  filtering, blocking + SSE streaming, function calling, transcript conversion, schema
  sanitisation, error taxonomy.
- **`lib/ai-review.ts`** — `aiReview(kind, payload)` for the DHIMS2 / nowcast / audit
  review prompts that used to call `or-review`.
- **`lib/agent/gemini.ts`** — reduced to a thin task layer (vision, ping) over `lib/llm.ts`,
  so there is exactly one place that speaks HTTP to a model.

Every consumer was repointed: `lib/agent/run.ts`, `lib/agent/tools.ts`,
`lib/agent/memory.ts`, `lib/agent/deep-research.ts`, `lib/analyze.ts`, `lib/cms.ts`,
`instrumentation-node.ts`, and the API routes `chat`, `agent`, `briefing`, `field-brief`,
`forecast`, `search`, `nowcast`, `series`, `transcribe`, `tts`, `diagnostics`, `health`.
`lib/agent/models.ts` now pins only bare Gemini/Gemma slugs. The UI (`KeyStatus`,
`/agent`, `/admin`, `/intelligence`, `/vision`, `/extracts`, `/workbook`, `/`) tells the
truth about one key. `.env.example` and `render.yaml` were rewritten.

## 3. The protocol gap that had to be closed

OpenRouter is OpenAI-compatible. Gemini is not. These are the real incompatibilities the
engine now absorbs — each one is covered by a forensic check:

| OpenAI/OpenRouter shape | Gemini shape | How `lib/llm.ts` handles it |
|---|---|---|
| `models: [a, b, c]` — up to 3 slugs per request | the slug is **in the URL** — exactly **one** model per request | `MAX_MODELS_PER_REQUEST = 1`; the chain is walked one model at a time and the answering model is reported |
| `Authorization: Bearer` | `x-goog-api-key` header | — |
| `{role:"system"}` message | `systemInstruction` (a separate top-level field) | `toGeminiContents()` hoists it |
| `{role:"assistant"}` | `{role:"model"}` | mapped |
| `{role:"tool", tool_call_id}` | **no tool role, no call ids** — a *user* turn carrying `functionResponse{name, response}` | mapped, with synthetic ids `call_{i}_{name}` so the agent loop's bookkeeping still works |
| `tools:[{type:"function"}]` + `tool_choice:"auto"` | `tools:[{functionDeclarations}]` + `toolConfig.functionCallingConfig.mode:"AUTO"` | mapped |
| streamed `delta.tool_calls[].function.arguments` fragments | complete `functionCall` parts | parsed per frame |
| full JSON Schema | OpenAPI-ish subset — `$schema`, `additionalProperties`, `exclusiveMinimum` are **rejected outright** | `sanitizeSchema()` strips them recursively |
| `response_format: json_object` | `responseMimeType: "application/json"` — **incompatible with tools** | only set when no tools are present |
| — | 2.5 models spend the output budget on **hidden thinking** and return `MAX_TOKENS` with *no text* | `thinkingBudget: 0` by default; a starved response retries with a plain config and a bigger budget |
| — | response parts flagged `thought: true` | never returned as the answer; routed to the reasoning channel |
| `402` credit exhausted | `429` quota exhausted per model | rotates to the next model, then to the free-tier chain |

## 4. Model chain — live-verified 2026-08-29

The chain is filtered against `GET /v1beta/models` for the caller's own key *before* any
request goes out, so a retired slug is never requested. A `404` slug is cached dead for
the process, so it is never paid for twice.

**Live:** `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`,
`gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-flash-latest`, `gemini-pro-latest`,
`gemma-3-27b-it`, `gemma-3-12b-it`.

**Dead — rejected by the pin validator and the self-tests:** `gemini-1.5-flash`,
`gemini-1.5-pro`, `gemini-1.0-pro`, `gemini-pro`, and **every vendor-prefixed slug**
(`openai/…`, `anthropic/…`, `deepseek/…`, `meta-llama/…`, `mistralai/…`,
`openrouter/auto`, and even `google/gemini-2.5-flash` — the Gemini API takes the bare
slug, so the prefixed form is a 404).

## 5. Features that changed provider, not behaviour

| Feature | Before | Now |
|---|---|---|
| Chat, agent loop, tool calling, streaming | OpenRouter | Gemini `:streamGenerateContent?alt=sse` |
| Briefing, forecast narrative, field brief, search | OpenRouter | Gemini |
| Nowcast / series review, DHIMS2 audit | `lib/or-review.ts` | `lib/ai-review.ts` |
| Speech-to-text | OpenAI Whisper → OpenRouter → browser | **Gemini** (audio `inlineData`) → browser Web Speech |
| Text-to-speech | ElevenLabs → OpenRouter → browser | ElevenLabs → **Gemini TTS** (`responseModalities:["AUDIO"]`, raw s16le PCM @24 kHz wrapped in a WAV header) → browser |
| Vision, deep research, image generation | already Gemini | unchanged, now on the shared engine |

## 6. Environment

**Removed everywhere:** `OPENROUTER_API_KEY`, `OPENROUTER_API_BASE`,
`OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE`, `OPENROUTER_IMAGE_MODELS`,
`OPENAI_API_KEY`.

**Required:** `GEMINI_API_KEY` (aliases `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
`GEMINI_KEY`, `GOOGLE_GENAI_KEY`).

**Optional:** `GEMINI_MODELS`, `GEMINI_IMAGE_MODELS`, `GEMINI_TTS_VOICE` (default `Kore`),
`GEMINI_API_BASE` (test override), `AGENT_MAX_STEPS`, `TAVILY_API_KEY`,
`UNSPLASH_ACCESS_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `OPENWEATHER_API_KEY`,
`ADMIN_*`, `SESSION_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`.

## 7. The scan itself

`npm run forensic` boots a **local mock Gemini API** and drives the **real compiled
`lib/` code** against it — no network, no real key. 42 checks across 6 layers:

1. **Static audit** — typecheck, lint, dead-slug lists, source contracts, config files.
2. **Gemini engine forensics** (16 checks) — key on the right header and URL; the chain
   walks in order and reports who answered; a retired slug is skipped, cached and never
   re-requested; the catalogue filters dead slugs pre-flight; 429 → free chain; a pinned
   model is used **alone with zero substitution**; pinning a dead model fails **loudly**;
   a rejected key stops the chain at once; streaming deltas; streaming tool calls;
   tool-rejection retry; the tool round trip survives transcript conversion;
   `thinkingBudget 0`; `thought` parts never streamed as the answer; catalogue status
   distinguishes verified from unverifiable; catalogue outage degrades without blocking chat.
3. **Gemini client forensics** — request shape, quota rotation, auth errors, thinking-
   starvation recovery, image + PDF `inlineData`, hidden-thought filtering.
4. **Vision pipeline** — a real PDF is read; an outage is a **loud refusal, never a blind
   answer**; Vision Lab success, no-key and outage paths.
5. **Deep research** — decompose + synthesis both on Gemini; offline and outage degrades
   are labelled, never invented.
6. **Documents** — the real Phase 2 workbook PDF extracts 38,742 clean characters; plain
   and FlateDecode streams; a scanned PDF yields an empty layer rather than garbage.

## 8. Honest limits

1. **One key means one blast radius.** An exhausted or revoked `GEMINI_API_KEY` takes
   every AI surface down at once. `/api/health` and `/api/diagnostics` say exactly that;
   the statistical forecast desks, regional board, sandbox and offline briefings keep working.
2. **Gemini free-tier rate limits are per-minute and per-day.** The chain rotates and the
   free-tier models are tried last, but no fallback invents quota.
3. **Inline request payloads cap around 20 MB.** `/api/transcribe` refuses audio above
   ~18 MB rather than sending a request that will be rejected. Very large PDFs must be
   split.
4. **Gemma models do not support function calling.** They are answer-only tail entries in
   the chain; a tool-carrying turn skips them.

## 9. Superseded documents

`docs/RENDER_FORENSIC.md`, `docs/RENDER_DEPLOY_AUDIT.md`, `docs/FORENSIC_SCAN.md` and
`docs/FORENSIC_SCAN_2026-08-29.md` describe the OpenRouter era. They are kept unedited as
an audit trail and carry a SUPERSEDED banner pointing here.
`OPENROUTER_FORENSIC_FALLBACK_REPORT.txt` and `docs/originals/` are **supplied source
material**, not documentation of the current system, and are preserved verbatim.
