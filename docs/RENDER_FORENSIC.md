# Render.com forensic — current repo (2026-08-19)

**Live Render Apply was not run from this sandbox.** This is a full static + local-runtime audit of *this* branch (`arena/01a01814-one-health`).

**Boot: YES.** One Node web service, health 200, all public pages 200, TypeScript clean, selftests pass.

**“Every feature works perfectly forever”: NO.** Host limits remain. They are listed below, not hidden.

## A. Plumbing (will Apply + first deploy succeed?)

| Item | Status |
|---|---|
| `render.yaml` web `plan: free` | Present |
| Postgres `one-health-db` `plan: free` + `DATABASE_URL` fromDatabase | Present (one free DB per workspace; **expires ~30 days**) |
| Build `npm ci --include=dev && npm run build` | Correct (Tailwind/TS are devDeps) |
| Start `npm start` → `0.0.0.0` + `$PORT` | Correct |
| Health `GET /api/health` | 200 locally; store errors swallowed |
| Lint cannot fail build | `eslint.ignoreDuringBuilds` |
| Bad site URL cannot crash build | `safeSiteUrl()` |
| `pg` not webpack-bundled | `serverExternalPackages` |
| Node 22 | `.node-version` + `NODE_VERSION` |
| Secrets not in git | `.env.local` ignored |
| Required dashboard secrets | `OPENROUTER_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL` |
| Optional keys | Empty defaults — Apply not blocked |

Frankfurt region is valid. Hobby/free web **still exists** in 2026, with 15-minute sleep, ~750 instance hours/month, and tight bandwidth.

## B. Local proof (this machine, just re-run)

- `tsc --noEmit` OK  
- Pages 200: `/` forecast surveillance climate intelligence vision extracts field regions workbook admin/login  
- APIs 200: health config snapshot nowcast weather series-template robots sitemap  
- Selftest: login, DHIMS2 quality, nowcast interval, archive growth, redaction, field brief  

Outbound TLS to OpenRouter from **this sandbox** still fails. **Render’s network does not have that block.**

## C. Feature matrix on Render

| Feature | On Render |
|---|---|
| Static/UI pages, Ghana desk, workbook PDF | Yes |
| Forecast, CUSUM, district overlay, nowcast numbers | Yes, no key |
| DHIMS2 parse + quality | Yes, no key |
| Official series → forecast | Yes; kept across web sleep **if** free Postgres is still alive |
| CMS / chats / audits | Same: survive web restart via snapshot in Postgres |
| Event log JSONL | Written on instance disk; **also** to `ohg_events` if DB is up |
| Chat / vision / extract review / field brief | Yes **if** key is set; paid models then `:free` models on 402 |
| Weather | Yes if `OPENWEATHER_API_KEY`; else placeholder rows |
| Tavily search | Yes if key; else DuckDuckGo HTML |
| ElevenLabs speak | Yes if key; else browser TTS |
| Microphone | Visitor’s browser, not Render |
| Admin | Yes with `ADMIN_*` |
| Signed audit | Yes (HMAC) |

## D. Still not “perfect”

1. Free web **sleeps ~15 minutes** — next hit is a 30–60s cold start.  
2. Free Postgres **expires ~30 days** then a short grace window, then delete. Upgrade that DB to keep history.  
3. Free-model AI is **rate-limited** and weaker than GPT/Claude. A 402 with no working `:free` path still means no live model.  
4. Huge vision PDFs can OOM on 512 MB RAM.  
5. I have not clicked Apply on *your* Render account.

## E. Deploy so this audit holds

Dashboard → New → Blueprint → `ThaddeusHackz/ONE-HEALTH` → branch `arena/01a01814-one-health` → fill the four secrets → Apply.

Then open `/api/health` (expect `openrouter: true`, `postgres: true`) and Admin → API desk → probe.
