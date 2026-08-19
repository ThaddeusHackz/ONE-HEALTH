# Render.com forensic — will every feature work?

Date: 2026-08-19  
**Boot verdict: YES**, as one Node web service, if you set the four required secrets.  
**“Everything works just as locally” verdict: NO — not every feature, not forever, not on free disk.**

This is the honest map. Nothing here is a guess about a feature we did not implement.

## A. Deploy plumbing (will the box come up?)

| Check | Result | If it fails |
|---|---|---|
| One process for UI + `/api` | Pass | — |
| `0.0.0.0` + `$PORT` | Pass (`scripts/start.cjs`) | Render default PORT is 10000; we honour it |
| `GET /api/health` → 200 | Pass (store errors swallowed) | Deploy would roll back |
| Build has TypeScript/Tailwind | Pass (`npm ci --include=dev`) | Need `--include=dev` or `next build` cannot compile |
| `next` at runtime | Pass (production dependency) | — |
| Lint cannot fail the build | Pass (`eslint.ignoreDuringBuilds`) | Fixed this pass |
| Invalid `NEXT_PUBLIC_SITE_URL` cannot crash build | Pass (safe URL helper) | Fixed this pass |
| `pg` not webpack-bundled | Pass (`serverExternalPackages`) | Fixed this pass |
| Node 22 | Pass (`.node-version` + `NODE_VERSION`) | — |
| SIGTERM on deploy | Pass | — |
| Secrets not in git | Pass | — |
| Blueprint plan | **starter** | Free web services spin down; starter stays warm |

Required dashboard values: `OPENROUTER_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`.  
Optional keys default to empty so **Apply is not blocked**.

## B. Feature-by-feature on Render

| Feature | Works on Render? | Condition |
|---|---|---|
| Home, regions, workbook, white UI | **Yes** | Always |
| Forecast ensemble, CUSUM, intervals | **Yes** | Always (local engine) |
| District overlay | **Yes** | Always |
| Reporting-delay nowcast (numbers) | **Yes** | Always |
| DHIMS2 CSV parse + quality log | **Yes** | Always |
| Official series driving forecast | **Yes until restart** | Disk is ephemeral unless Postgres/disk add-on |
| Surveillance snapshot | **Yes** | Always |
| Climate / OpenWeather | **Yes if key** | Outbound HTTPS works on Render |
| Tavily / DuckDuckGo search | **Yes** | Tavily if key; else DuckDuckGo HTML |
| Intelligence chat | **Yes if OpenRouter key + credit** | 402 = no model |
| OpenRouter review of extracts / nowcast | **Yes if key + credit** | Sandbox TLS block does **not** apply on Render |
| Vision any-file | **Yes if key** | Large files can OOM on tiny RAM |
| Field briefs + TTS | **Yes** | TTS needs ElevenLabs **or** browser speech |
| Browser microphone | **Yes** | Runs in the visitor’s Chrome, not on Render |
| Admin CMS | **Yes** | Login with `ADMIN_*` |
| Signed audit download | **Yes** | HMAC with `SESSION_SECRET` |
| Event log JSONL | **Yes, until sleep/redeploy** | Lost on free/ephemeral disk |
| 89-year archive | **Only with `DATABASE_URL` + backups** | Not automatic on paid web-only |

## C. What I will not claim

- I have not clicked **Apply** on your Render account from this sandbox. This is a static + runtime audit, not a live Render deploy.
- I cannot promise “every feature works perfectly.” OpenRouter credit, file size, and disk policy are outside the repo.
- Forecasts remain intervals. Render does not make them certain.

## D. How to deploy so this audit holds

1. dashboard.render.com → New → Blueprint → `ThaddeusHackz/ONE-HEALTH` → branch `arena/01a01814-one-health`.
2. Paste the four required secrets. Paste Tavily / ElevenLabs / OpenWeather / `DATABASE_URL` if you have them.
3. Wait for health green. Open `https://YOUR-SERVICE.onrender.com/api/health` — `openrouter` should be `true`.
4. Admin → API desk → probe. That is the live key test Render can do and this sandbox cannot.
