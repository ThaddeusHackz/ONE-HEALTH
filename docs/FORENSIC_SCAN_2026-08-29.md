# Forensic scan 2026-08-29 — vision/deep-research engine split, model-chain rot, PDF extraction, dev-server bootstrap

Scope: the full platform. Method: `npm run forensic` — typecheck, lint, source
contracts, then the **real compiled `lib/` code driven against local mock
OpenRouter + Gemini HTTP servers** (no external network, no real keys), plus the
real Phase 2 workbook PDF. 34 checks, all passing.

---

## 1. The vision + deep-research engine contract (user requirement)

**Requirement:** vision and deep research must run on the independent
`GEMINI_API_KEY` from Google AI Studio — never on the OpenRouter key.

**What was found:** both paths ran Gemini *first* but silently fell back to the
OpenRouter vision chain (`visionAnalyze`, 9 vision slugs) or the OpenRouter
research synthesiser whenever Gemini was missing, quota-limited or slow. A user
with only a Gemini key could not tell which provider actually read the file.

**What was done (verified by the scan, Layer 4 + Layer 5):**

- `lib/agent/tools.ts` `vision_read` — Gemini only. On outage or a missing key
  it **fails loudly** (`VISION FAILED - the attachment was NOT read`) and
  forbids the model from describing the file. Zero OpenRouter calls, ever.
- `lib/analyze.ts` (Vision Lab + One Health ingest) — Gemini only, with a
  labelled degrade to local text extracts when the engine is down.
- `lib/agent/deep-research.ts` — decompose **and** synthesis on Gemini. No key
  → offline source digest; engine outage → labelled raw digest. Zero OpenRouter
  imports remain in the file.
- `visionAnalyze` and `VISION_MODELS` deleted from `lib/openrouter.ts` — the
  product can no longer accidentally see files through OpenRouter.
- `/api/health` now advertises `vision`, `visionEngine`, `deepResearch`
  capabilities; `/api/diagnostics` explains the contract.

## 2. Why "Claude, Mistral and DeepSeek don't work" — and the permanent fix

Live-verified against `openrouter.ai/api/v1/models` on 2026-08-29:

| Old chain/dropdown slug | Status on 2026-08-29 |
|---|---|
| `anthropic/claude-3.5-sonnet` | **dead** — `endpoints: []` |
| `mistralai/mistral-large-2411` | **dead** — `endpoints: []` |
| `meta-llama/llama-3.3-70b-instruct:free` | **dead** |
| `google/gemma-3-27b-it:free`, `qwen/qwen-2.5-72b-instruct:free`, `mistralai/mistral-7b-instruct:free`, `nousresearch/hermes-3-llama-3.1-405b:free` | **dead** |
| `openai/gpt-oss-120b:free`, `openai/gpt-oss-20b:free`, `inclusionai/ling-3.0-flash:free`, `deepseek/deepseek-chat-v3-0324:free` | **dead** (verified during this scan) |
| `anthropic/claude-sonnet-4.6`, `claude-sonnet-4`, `claude-haiku-4.5`, `deepseek/deepseek-chat`, `deepseek-v3.2`, `deepseek-r1`, `mistralai/mistral-nemo`, `mistral-small-3.2`, `mistral-large-2512`, `llama-3.3-70b-instruct`, `google/gemma-4-31b-it:free`, `nvidia/nemotron-3-*-a*:free` | live |

Because OpenRouter fails a whole 3-slug `models` request when one slug has no
endpoints, the two dead slugs sat **inside** the Claude/DeepSeek/Mistral
groups and poisoned every request they were part of — pinning Mistral or the
3.5 Sonnet dropdown entry was a guaranteed 404.

**Fixes (three layers, so this cannot recur):**

1. **Refreshed chain** — every `CHAT_MODELS` / `FREE_MODELS` / `PINNABLE_MODELS`
   slug re-verified live on 2026-08-29; retired slugs purged from the product.
2. **Live-catalogue filtering** — before any request, the chain is checked
   against OpenRouter's public `/models` catalogue (cached 10 min, degrades to
   the static chain if unreachable). A slug that dies next month is skipped
   automatically.
3. **Dead-slug group recovery** — if a "No endpoints found" error still slips
   through (stale catalogue), the offending slug is extracted from the error,
   the group is retried without it, and the slug is remembered for the process
   lifetime. Works in both the normal and the streaming path.

`/api/diagnostics` gained a `model-chain` check that honestly reports
`N/M slugs live` versus `catalogue unreachable` (never a fake "all live").

## 3. The PDF / document bug

The old `extractPdfText` matched `stream\r\n` **inside the word `endstream`**,
so it read the binary object table *between* streams instead of the streams
themselves. On the real Phase 2 workbook it returned **40,000 characters of
binary mojibake** — which was then injected into every model prompt and stored
as the "text layer", corrupting ingest, vision reads and DHIMS2-style flows.

**Fix:** proper extraction — stream boundaries that exclude `endstream`,
FlateDecode inflation (`unzlibSync`), and decoding of the real text operators
(`(str) Tj`, `[… (a) (b) …] TJ`, `<hex> Tj`) with PDF escapes resolved.
Result on the same file: **38,742 characters of clean text, zero control
bytes** (title, TOC and all module headings readable). Files with no text
layer still hand off to the Gemini vision engine as inline data.

## 4. `npm run dev` was completely broken (every route 500)

- `instrumentation.ts` imported `lib/store` (→ `fs`) at module scope. Next
  compiles instrumentation for **both** Node and Edge runtimes; the Edge build
  cannot resolve `fs`, the bootstrap failed, and **every API route returned
  500** in dev. Production happened to survive. Fixed with the documented
  runtime split: `instrumentation.ts` dispatches to a new
  `instrumentation-node.ts` only under `NEXT_RUNTIME === "nodejs"`.
- `pg`'s optional `pg-native` require chain also broke the dev webpack build
  (`serverExternalPackages` alone did not stop resolution). `pg-native` is now
  aliased to `false` in `next.config.ts`, which is exactly what `pg`'s own
  try/catch expects when the native driver is absent.

## 5. Data-store race

`data/db.json` was written with a bare `writeFileSync`; a concurrent reader
could observe a truncated file (`Unexpected end of JSON input` — seen live as
a `/api/nowcast` 500). Writes are now atomic: temp file in the same directory
+ `renameSync`.

## 6. Testability infrastructure

`OPENROUTER_API_BASE` and `GEMINI_API_BASE` env overrides let the forensic
scan (and any future test) point the **real** client code at mock providers.
Default values are unchanged production URLs.

## Verification matrix (all green)

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint .` | 0 errors |
| `npm run selftest:agent` | ALL PASS (44 checks) |
| `npm run forensic` | 34/34 checks PASS |
| `npm run dev` + `npm run selftest` | 29/29 HTTP checks PASS |
| `npm run build` + prod server + `selftest` | 29/29 HTTP checks PASS |

Run it yourself: `npm run forensic` (mock-driven, no keys needed), `npm test`
for the whole battery.
