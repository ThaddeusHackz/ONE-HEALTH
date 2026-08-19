# Inventory - everything built on this branch

This is the complete list of work from the ONE HEALTH GHANA session. Latest forensic pass lives on `arena/01a0189f-one-health`.

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
