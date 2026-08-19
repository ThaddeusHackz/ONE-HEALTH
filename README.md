# ONE HEALTH GHANA

National **disease forecasting, document vision, and early-warning** desk for the **Ghana Health Service**.

This repository turns the Phase 2 modelling workbook into a working system:

- probabilistic 4-week forecasts (baselines → ridge → random forest → ensemble)
- IDSR-style z-score watches
- OpenRouter multi-model intelligence with automatic fallback
- vision on photos, scans, and mixed files
- voice in/out
- Ghana-weighted web search
- a white 2026 interface in Ghana flag + clinical teal

**Forecasts are not error-free.** They are intervals. An alert is a prompt to investigate, not a confirmed outbreak.

## Quick start

```bash
cp .env.example .env.local
# put OPENROUTER_API_KEY in .env.local — never commit it
npm install
npm run dev
```

Open http://localhost:3000

Without a key the statistical engine, regional board, and offline briefings still run. Live vision, chat synthesis, and Whisper need OpenRouter.

Admin CMS (Wix-style copy, colours, nav, stored files): `/admin`  
Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local`. Never commit them.

Host anywhere that can run Node 20+ (Render, Railway, a VPS, Docker):

```bash
npm ci --include=dev
npm run build
npm start
```

The process listens on `0.0.0.0:$PORT`. Put keys in the host’s environment panel, not in the repo. Official DHIMS2 CSVs can be loaded on `/forecast`. Audit pack downloads from `/admin`.

## What to put in Render

See [DEPLOYMENT.md](DEPLOYMENT.md). Required for live AI:

| Variable | Purpose | Where to get it |
|---|---|---|
| `OPENROUTER_API_KEY` | Chat, vision, fallback chain, optional Whisper | https://openrouter.ai/keys |
| `TAVILY_API_KEY` | Cited web search | https://tavily.com |
| `ELEVENLABS_API_KEY` | Spoken briefings | https://elevenlabs.io |
| `OPENWEATHER_API_KEY` | Optional climate context | https://openweathermap.org |

Do **not** put secrets in `NEXT_PUBLIC_*`. That would publish them to every visitor.

## Keys you may add later

- **OpenRouter** is enough for most of the desk (many vendors behind one bill).
- **Tavily** if you want cleaner citations than the DuckDuckGo fallback.
- **ElevenLabs** if device TTS is not good enough for Twi-adjacent English briefings.
- **Official GHS / DHIMS2 extracts** — not an API key, but the data that must replace the demonstration series before operational use.

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
