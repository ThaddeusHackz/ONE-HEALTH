# ONE HEALTH GHANA

National **disease forecasting, document vision, and early-warning** desk for the **Ghana Health Service**.

This repository turns the Phase 2 modelling workbook into a working system:

- **AI Agent** (`/agent`) - reasoning, live web research, Gemini vision, image generation, an in-browser code sandbox with a full self-scan, charts, tables, long-term memory and 2 GB workspace uploads
- probabilistic 4-week forecasts (baselines → ridge → random forest → ensemble)
- IDSR-style z-score watches
- OpenRouter multi-model intelligence: pin any model (used alone, never substituted) or run the Auto fallback chain
- vision on photos, scans, and mixed files - powered by the Gemini API key in every mode
- deep research synthesis on the Gemini API key
- voice in/out
- Ghana-weighted web search
- a white 2026 interface in Ghana flag + clinical teal

**Forecasts are not error-free.** They are intervals. An alert is a prompt to investigate, not a confirmed outbreak.

## Quick start

```bash
cp .env.example .env.local
# put OPENROUTER_API_KEY (chat) and GEMINI_API_KEY (vision + research) in .env.local - never commit them
npm install
npm run dev
```

Open http://localhost:3000

Full forensic scan (typecheck + lint + the real engine code against mock providers - no keys needed):

```bash
npm run forensic
```

Without keys the statistical engine, regional board, the agent sandbox and offline briefings still run. Reasoning (chat) needs OPENROUTER_API_KEY; vision, deep research and image generation need the independent GEMINI_API_KEY from Google AI Studio - the two never mix.

### Optional keys that light up more of the AI Agent

| Variable | Unlocks |
|---|---|
| `GEMINI_API_KEY` | **vision on every surface** (agent, Vision Lab, ingest), **deep research synthesis**, **image generation** |
| `TAVILY_API_KEY` | live web search, deep research (DuckDuckGo fallback otherwise) |
| `UNSPLASH_ACCESS_KEY` | real stock photography (Tavily images otherwise) |
| `OPENAI_API_KEY` | Whisper speech-to-text directly (OpenRouter route otherwise) |
| `ELEVENLABS_API_KEY` | high-quality spoken answers (device voice otherwise) |
| `OPENWEATHER_API_KEY` | live climate pillar |
| `GEMINI_MODELS` | comma-separated Gemini text/vision models tried first |
| `GEMINI_IMAGE_MODELS` | comma-separated Gemini image models tried first |
| `AGENT_MAX_STEPS` | agentic tool steps per turn (default 8, max 24) |

Agent docs: [`docs/AI_CAPABILITIES.md`](docs/AI_CAPABILITIES.md) · [`docs/AGENT_FORENSIC.md`](docs/AGENT_FORENSIC.md)

Admin CMS (Wix-style copy, colours, nav, stored files): `/admin`  
Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local`. Never commit them.

Host anywhere that can run Node 20+ (Render, Railway, a VPS, Docker):

```bash
npm ci --include=dev
npm run build
npm start
```

## Tests

```bash
npm run typecheck        # tsc --noEmit
npm run selftest:agent   # drives the real compiled agent modules (24 assertions)
npm run selftest         # 22 HTTP checks against a running server
npm test                 # both
```

The process listens on `0.0.0.0:$PORT`. Put keys in the host’s environment panel, not in the repo. Official DHIMS2 CSVs can be loaded on `/extracts`. Field briefs are on `/field`. Audit pack and the append-only event log download from `/admin`. Full inventory: [CHANGELOG.md](CHANGELOG.md).

**Longevity:** every mutation is appended to `data/events.jsonl` and, if `DATABASE_URL` is set, to Postgres. That can last decades **only if** you keep that database and off-site backups. A free Render disk is wiped on sleep - it will not last 89 years by itself.

## What to put in Render

See [DEPLOYMENT.md](DEPLOYMENT.md). Required for live AI:

| Variable | Purpose | Where to get it |
|---|---|---|
| `OPENROUTER_API_KEY` | Chat reasoning + the Auto fallback chain (never vision or research) | https://openrouter.ai/keys |
| `GEMINI_API_KEY` | **Vision on every file/photo/PDF, deep research, image generation** - an independent key from Google AI Studio | https://aistudio.google.com/apikey |
| `TAVILY_API_KEY` | Cited web search | https://tavily.com |
| `ELEVENLABS_API_KEY` | Spoken briefings | https://elevenlabs.io |
| `OPENWEATHER_API_KEY` | Optional climate context | https://openweathermap.org |

Do **not** put secrets in `NEXT_PUBLIC_*`. That would publish them to every visitor.

## Keys you may add later

- **OpenRouter** is enough for most of the desk (many vendors behind one bill).
- **Tavily** if you want cleaner citations than the DuckDuckGo fallback.
- **ElevenLabs** if device TTS is not good enough for Twi-adjacent English briefings.
- **Official GHS / DHIMS2 extracts** - not an API key, but the data that must replace the demonstration series before operational use.

We cannot mint API keys for you. Create them on those sites and paste them into Render’s Environment tab.

## Repository map

```
app/            Next.js App Router (pages + API)
components/     Shell, markdown, disclaimer
lib/            Ghana ontology, forecast engine, OpenRouter, search
public/images/  Workbook and UI figures (the missing PDF pictures)
notebooks/      Ghana companion notebook
docs/           Forensic scan + modified workbook notes
workbook/       PDF generator for the illustrated Ghana workbook
```

## Scientific contract (from the original workbook)

1. Understand → implement → validate → let AI assist → criticise → improve.
2. Chronological splits only.
3. `shift(1)` before every rolling feature.
4. Beat a naive baseline or do not brief.
5. Print an interval.
6. Never paste patient identifiers into a model.
