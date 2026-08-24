# Inventory - everything built on this branch

This is the complete list of work from the ONE HEALTH GHANA session. Latest forensic pass lives on `arena/01a03499-one-health-ai`.

## 2026-08-24 AI Agent tab (this pass)

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
