# Inventory - everything built on this branch

This is the complete list of work from the ONE HEALTH GHANA session. Latest forensic pass lives on `arena/01a03499-one-health-ai`.

## 2026-08-25 (pass 2) Forensic scan - the vision pipeline was blind; now it sees

### CRITICAL: attachments never reached the server (fixed end to end)
- useAgent sends attachments as a TOP-LEVEL payload field, but `/api/agent` only read
  `turns[*].attachments` - which the client never populated. `vision_read`'s tool context
  was therefore ALWAYS empty: the agent saw the file's NAME in its prompt but the file
  itself never arrived, so every vision turn answered blind (or refused).
- [x] `/api/agent` now validates (data: URL, ≤8 MB, ≤8 files) and MERGES top-level
  attachments onto the last user turn - where runAgent's context looks
- [x] `useAgent` re-sends the turn's attachments on sandbox_exec / ask_user resumes
  (`turnAttachmentsRef`), so a Builder run that pauses for the sandbox keeps its files
- [x] three new integration tests stub the HTTP layer and prove the full chain:
  photo → vision_read → Gemini inlineData (bytes + mime verified at the wire) → cited answer
- [x] text attachments larger than the 24 KB inline block now ride to Gemini through
  vision_read instead of vanishing; over-budget attachments are skipped LOUDLY with a
  note, never silently
- [x] `file` SSE events without a payload can no longer push `undefined` into the file
  list (render crash guard, client + message renderer)

### Robustness / OOM guards
- [x] `/api/vision` + `/api/ingest`: 8 files × 8 MB caps (server) and matching client
  guard on the Vision Lab page - a big upload can no longer OOM the 512 MB Render
  instance; both return readable 413s pointing at the 2 GB workspace upload
- [x] workspace file cap raised 120 KB → 800 KB: a Builder artefact (full single-file
  dashboard) is never silently truncated after the agent verified the complete code;
  the Postgres snapshot trim remains the real safety net
- [x] uploads: mkdir before statfs (disk check on first-ever upload), clear
  "partial upload lost - server restarted" error, re-upload supersedes same-name entries
- [x] pinned `complete()` propagates the real HTTP status instead of a guessed one

### Hygiene
- [x] eslint config ignores `.next`/compiled self-test output/generated files - the repo
  now lints with **0 errors** (was 68 false ones); unused-var and no-await-in-loop cleanups
- [x] platform selftest: +2 permanent checks (top-level attachments accepted; vision/ingest
  413 guards). Full battery: 27 platform + 53 agent self-tests, typecheck, eslint, build,
  and a 30-endpoint HTTP sweep (all pages, all APIs, traversal attempts rejected) green

## 2026-08-25 Pinned models, Gemini everywhere, 2 GB workspace, in-flow sandbox

### Model pinning (top menu) - the version you select is the version that answers
- [x] `lib/openrouter.ts` - `complete()`/`completeStream()` take `pinned: true`: the request carries ONE `model` slug, no `models` fallback array, and the only retries are the same slug (tools dropped if rejected, one transient retry). A dead/credit-starved slug fails LOUDLY with a `model_reset` event - it can never silently answer from gpt-4.1-mini again
- [x] `lib/agent/run.ts` - emits `Answering with <slug> (pinned - no substitution)`; on genuine pin failure emits `model_reset` (UI returns the dropdown to Auto and shows the reason), then continues on the untouched Auto chain
- [x] `lib/agent/models.ts` - client-safe catalogue: the 7 promised slugs (gpt-4.1-mini, gemini-2.5-flash, gpt-4o, gemini-2.5-pro, claude-sonnet-4, deepseek-chat, llama-3.3-70b:free) plus gpt-4.1, gpt-4o-mini, claude-3.5-sonnet, deepseek-r1, gemma-3-27b:free, mistral-large; dropdown grouped by provider; header chip shows the pinned/answering model
- [x] `app/api/agent/route.ts` - slug validated before the run; body cap raised to 40 MB for 5×6 MB attachments

### Gemini is the vision + research + image engine platform-wide
- [x] `lib/agent/gemini.ts` - **fixed the "key works elsewhere but not here" bug**: gemini-2.5+ thinking models starved maxOutputTokens and returned NO text (finishReason MAX_TOKENS) - now thinkingBudget:0 is sent on thinking-capable models, token budgets are ≥2048 (4096 default), a MAX_TOKENS empty response retries with a larger budget, and `thought:true` parts can never leak into output
- [x] `geminiVision()` - canonical vision entry (used by agent vision_read + Vision Lab); `geminiPing()` for /api/diagnostics
- [x] `lib/agent/tools.ts` vision_read - Gemini first, guarded OpenRouter fallback, provider named in the answer
- [x] `lib/agent/deep-research.ts` - decomposition AND synthesis on Gemini; a Gemini outage now falls back to OpenRouter instead of killing the research run
- [x] `lib/analyze.ts` (Vision Lab /api/vision) - Gemini first, OpenRouter fallback
- [x] `lib/agent/run.ts` - attachments are no longer inlined as base64 parts (which 400'd pinned non-vision models): every mode reads files through vision_read/Gemini; vision_read is force-enabled whenever a file is attached

### 2 GB workspace uploads
- [x] `lib/agent/uploads.ts` - chunked (6 MB) disk-backed registry under `data/uploads/` (gitignored): init → PUT chunk → complete, 2 GB per-file cap, disk-space guard, stale-upload pruning, re-upload supersedes
- [x] `app/api/agent/upload/route.ts` + `app/api/agent/download/route.ts` - control actions, raw-binary chunk PUT, streaming download with HTTP Range support
- [x] `app/api/agent/files/route.ts` - merges small DB artefacts and large uploads; text heads readable
- [x] Agent tools `list_files`/`read_file`/`delete_file` see uploads; `read_file` streams the first ~200 KB
- [x] Files tab: Upload button + drag-drop with live progress, download links for uploads, 120 MB verified end-to-end (20 chunks)

### Sandbox: in-flow panel (clickability fix) + full self-scan
- [x] `app/agent/page.tsx` - the fixed `inset-0 z-[70]` overlay drawer (which covered the header, so Preview/model/buttons above the sandbox were unclickable) is gone: chat and workspace now sit side by side in the page flow, arena.ai/agent style; header always clickable; Escape/overlay removed
- [x] "Full scan" button - runs every runtime end to end (JS sync/async/console/error, JSON, CSV, Markdown, Mermaid, Python/Pyodide, HTML/SVG/CSS preview), logs PASS/FAIL + timings to the console and saves `sandbox-scan-report.md` to the workspace
- [x] Composer: 6 MB/file × 5 attachments, client-side image downscaling to 1568px for lean Gemini payloads, oversize files routed to the 2 GB workspace upload
- [x] `+ GEMINI_MODELS` in render.yaml/.env.example; README key table updated

## 2026-08-24 AI Agent tab (previous pass)

New room: **AI Agent** at `/agent`, placed between Home and Forecast in the nav, with a
hero button on Home. It is a general-purpose agentic desk built to the standard of
ChatGPT / Claude / Copilot / Arena Agent Mode, routed entirely through the OpenRouter key
with the existing multi-model fallback, and specialised for Ghana One Health.

### Agent core
- [x] `lib/agent/run.ts` - agentic loop: plan → tool calls → read results → continue, up to `AGENT_MAX_STEPS` (default 8)
- [x] `lib/openrouter.ts` - `completeStream()` with SSE parsing, tool-call accumulation, and the 3-slug-per-request chunking reused for streaming; providers that reject `tools` are retried without them; 402 retries on the `:free` pool
- [x] `lib/agent/tools.ts` - 22 declared tools with JSON schemas, executors and the Ghana system prompt
- [x] `app/api/agent/route.ts` - POST = server-sent events stream (`delta`, `reasoning`, `tool_*`, `citations`, `chart`, `table`, `file`, `image`, `stock`, `plan`, `memory`, `sandbox_request`, `result`); GET = tool registry
- [x] Client-executed tools (`sandbox_exec`, `ask_user`) pause the stream, run in the browser, and POST the result back with the slimmed transcript

### Capabilities
- [x] Live web: `web_search` (Tavily, DuckDuckGo fallback), `web_fetch` (SSRF-guarded), `deep_research` (decompose → parallel search → read pages → cited brief)
- [x] Vision: attachments sent as `image_url` / `file` parts plus `vision_read` extraction
- [x] Images: `image_generate` on the OpenRouter Image API (`POST /api/v1/images`, base64 out) with a chat-`modalities` fallback; `image_search` on Unsplash with a Tavily-image fallback
- [x] Sandbox: `components/agent/SandboxFrame.tsx` - opaque-origin iframes (no `allow-same-origin`), JavaScript / HTML / CSS / SVG / JSON / Python (Pyodide), stdout + return value + errors relayed to the model
- [x] Data: `chart` (Recharts), `table`, `compute` (hand-written parser, no `eval`), `ghana_forecast`, `ghana_national_table`, `weather_now`
- [x] Memory: facts, conversations and workspace files in the snapshot store, keyword recall injected each turn, background distillation that refuses secrets
- [x] Voice in: MediaRecorder → `OPENAI_API_KEY` Whisper → OpenRouter Whisper → browser Web Speech
- [x] Voice out: ElevenLabs → OpenRouter `/audio/speech` → `speechSynthesis`
- [x] Modes: Chat, Deep Research, Builder, Vision, One Health; per-tool toggles; model pinning; "Think deeper"

### Interface
- [x] 2027 white theme scoped to `.agent-shell` in `app/globals.css` (aurora tint, hairline borders, layered shadow, liquid motion, shimmer + caret while streaming)
- [x] Three-pane desk: history rail with live-key status and capability inventory, conversation stream, Workspace panel (Preview / Code / Files / Console / Memory)
- [x] Composer: attachments (drag, paste, picker), voice, tool chips, ⌘/Ctrl+Enter, starter prompts
- [x] Export conversation as Markdown; copy and speak any answer

### Platform
- [x] `mergeNav` now re-sorts stored nav onto the canonical order, so a Postgres snapshot from an older deploy cannot pin the new tab to the end
- [x] `/api/health` reports `images`, `whisper`, `agentTools` and agent store counts
- [x] `/api/diagnostics` probes Unsplash, the OpenRouter image-model catalogue and Whisper
- [x] `.env.example` + `render.yaml`: `UNSPLASH_ACCESS_KEY`, `OPENAI_API_KEY`, `OPENROUTER_IMAGE_MODELS`, `AGENT_MAX_STEPS`
- [x] Workbook module 21 documents the agent; `docs/AI_CAPABILITIES.md` is now the agent dossier; `docs/AGENT_FORENSIC.md` records the external scan and the API contracts
- [x] `scripts/agent-selftest.cjs` compiles `lib/` with the project's own tsc and drives the real tool executors, memory and store (24 assertions); `scripts/selftest.cjs` gains 9 HTTP checks (22 total); `npm test` runs both

## 2026-08-24 image generation moved to the Gemini API (this pass)

Image generation no longer uses the OpenRouter Image API. Everything else - reasoning,
streaming, tool calling, vision, search, TTS, Whisper - is untouched.

- [x] `lib/agent/media.ts` rewritten for `POST /v1beta/models/{model}:generateContent` with
      `x-goog-api-key`, `responseModalities:["TEXT","IMAGE"]`, and image editing via an
      `inline_data` reference part
- [x] `extractGeminiImage()` accepts both `inlineData` (camel) and `inline_data` (snake) and
      is unit-tested for both, plus blocked-prompt and no-image responses
- [x] Chain is Gemini-native only: `gemini-2.5-flash-image`, `gemini-3.1-flash-image`,
      `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`,
      `gemini-2.5-flash-image-preview` - **Imagen is excluded because Google shut those
      endpoints down on 2026-08-17**
- [x] Aspect-ratio config differs per generation, so a 400 naming `responseFormat` /
      `aspectRatio` / `imageConfig` retries once without it; 401/403 stops with a readable
      key message; 429 advances to the next model
- [x] `geminiKey()` accepts `GEMINI_API_KEY`, `GOOGLE_API_KEY`,
      `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_KEY`, `GOOGLE_GENAI_KEY` and refuses an
      `sk-or-` key so an OpenRouter key is never sent to Google
- [x] `/api/agent/images` reports `engine: "gemini"` and the Gemini chain;
      `/api/diagnostics` probes the Gemini model list and reports which of the chain the key
      can reach; `/api/health` reports `imageGen` / `imageGenEngine` / `stockImages`
- [x] `.env.example` and `render.yaml`: `GEMINI_API_KEY` + `GEMINI_IMAGE_MODELS` replace
      `OPENROUTER_IMAGE_MODELS`
- [x] Agent UI gains an "Image gen (Gemini)" key chip; workbook module 21 corrected
- [x] Four new self-tests, including a repo-wide assertion that nothing still calls the
      OpenRouter image endpoint

### Not shipped, deliberately
- [ ] Host-side shell / computer use / MCP connectors / scheduled tasks / video generation (reasons in `docs/AGENT_FORENSIC.md` §7)


## 2026-08-19 live-host forensic (this pass)

- [x] Confirmed production `/api/health`: OpenRouter, Tavily, OpenWeather, ElevenLabs keys all **present**
- [x] Confirmed production `/api/diagnostics`: OpenRouter **400** because `models[]` longer than 3
- [x] Chunk OpenRouter fallback into groups of three; auto-slice oversized payloads
- [x] ElevenLabs probe uses `/v1/voices` (restricted keys cannot read `/v1/user`)
- [x] Blueprint no longer pins empty optional secrets (would wipe dashboard keys)
- [x] Forecast scoreboard now evaluates walk-forward backtests against the hold-out
- [x] Climate cities fetched in parallel
- [x] Forecast button no longer says “Running…” for a local ensemble compute
- [x] Workbook expanded to 21 modules: how every system was made
- [x] Key-status pills on Forecast, Intelligence, Vision, Climate, Extracts, Field
- [x] Env aliases for mistyped Render variable names

## Workbook and forensic

- [x] Forensic scan of the Phase 2 PDF (empty figures, scientific contract kept)
- [x] `code.txt` defects fixed (Ghana default, SARIMA on train only, `alerts` print, `.ffill()`, split after features)
- [x] Illustrated Ghana workbook PDF with real figures
- [x] Companion notebook `notebooks/ghana_one_health_forecasting.py`
- [x] Originals archived under `docs/originals/`
- [x] OpenRouter fallback report implemented (`models` array + `:free` retry)

## Public desks

- [x] Home (white 2026 UI, Ghana flag + teal)
- [x] `/forecast` - ensemble, intervals, CUSUM, district, official CSV, delay nowcast
- [x] `/surveillance` - national z-score board
- [x] `/climate` - OpenWeather + sitrep
- [x] `/intelligence` - chat, voice in/out, search, languages
- [x] `/vision` - any file (PDF, Word, Excel, CSV, images) + redaction
- [x] `/extracts` - DHIMS2 quality ingest + template
- [x] `/field` - spoken field briefs (en/tw/ee/gaa/ha)
- [x] `/regions` - 16 regions + representative MMDAs
- [x] `/workbook` - modified Phase 2 + PDF download
- [x] `/admin` - Wix-style CMS (copy, colours, nav, knowledge, records, API probe, signed audit, event log)

## Engine and APIs

- [x] Leakage-safe features, baselines, ridge, forest, ensemble
- [x] Reporting-delay nowcast
- [x] Redaction gate
- [x] Signed HMAC audit + verify POST
- [x] Append-only `events.jsonl` + optional Postgres snapshot/events
- [x] Free-model fallback when paid OpenRouter credit fails
- [x] Health, diagnostics, weather, search, TTS, transcribe, briefing

## Hosting

- [x] `render.yaml` - **free** web + **free** Postgres, `DATABASE_URL` wired
- [x] `scripts/start.cjs` - `0.0.0.0` + `$PORT` + SIGTERM
- [x] Safe `NEXT_PUBLIC_SITE_URL`, lint cannot fail build, `pg` external
- [x] `DEPLOYMENT.md`, `docs/RENDER_FORENSIC.md`
- [x] Secrets only in env (never committed)

## Honesty kept

Forecasts are intervals. Alerts are investigation prompts. Free Render sleeps. Free Postgres expires on Render’s schedule. Keys stay on the server.
