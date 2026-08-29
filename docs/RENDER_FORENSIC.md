# Render.com forensic - current repo (2026-08-19)

> **SUPERSEDED — historical record.** This document describes the platform when it
> still ran on OpenRouter. On 2026-08-29 the product was migrated to a **single
> Gemini engine** (`lib/llm.ts`, one `GEMINI_API_KEY`); no OpenRouter key, slug,
> env var or code path remains. Kept unedited as an audit trail. For the current
> architecture see [`GEMINI_MIGRATION_2026-08-29.md`](GEMINI_MIGRATION_2026-08-29.md)
> and [`AGENT_FORENSIC.md`](AGENT_FORENSIC.md).

Live host probed: `https://one-health-ghana.onrender.com`.

**Boot: YES.** Health 200. All public pages 200. TypeScript clean.

**“Every feature works perfectly forever”: NO.** Host limits remain. They are listed below, not hidden.

## Live probe (this pass)

| Check | Result |
|---|---|
| `/api/health` | `ok: true`, Node 22.12.0, postgres true |
| OpenRouter key | present `sk-or-v1…7d71` |
| Tavily | live 200 |
| OpenWeather | live 200 Accra |
| ElevenLabs key | present; `/v1/user` was `401 missing_permissions` (restricted key) |
| OpenRouter diagnostics (old payload) | **400** `'models' array must have 3 items or fewer.` |

That 400 is why Intelligence / Vision / Field / AI briefing looked broken. The key was valid. The fallback list was too long. Fixed on this branch by chunking into groups of three.

## A. Plumbing

| Item | Status |
|---|---|
| `render.yaml` web `plan: free` | Present |
| Postgres `one-health-db` `plan: free` + `DATABASE_URL` | Present |
| Build `npm ci --include=dev && npm run build` | Correct |
| Start `npm start` → `0.0.0.0` + `$PORT` | Correct |
| Health `GET /api/health` | 200 |
| Optional keys | `sync: false` - Blueprint Apply must not wipe dashboard secrets |

## B. After this deploy

1. Open `/api/health` - expect `openrouter: true` and `openrouterMaxModelsPerRequest: 3`.
2. Open Admin → API desk → probe - OpenRouter should now return a live model, not 400.
3. Intelligence: send “Greater Accra cholera watch, no names.” Expect a model name, not the offline card.
4. Climate: Accra temperature should be live.
5. Field brief: draft + speak (browser voice if ElevenLabs is restricted).

## C. Still not “perfect”

1. Free web **sleeps ~15 minutes** - next hit is a 30-60s cold start.
2. Free Postgres **expires ~30 days**.
3. Free-model AI is rate-limited.
4. Huge vision PDFs can OOM on 512 MB RAM.
5. ElevenLabs restricted keys cannot read account metadata; TTS still works via `/v1/voices`.
