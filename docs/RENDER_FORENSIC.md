# Render.com forensic — will this site actually boot?

Date: 2026-08-19  
Verdict: **Yes, as one Node web service**, if you fill the `sync: false` secrets. It will not be “perfect forever” on the free tier. The list below is what was checked and what was fixed.

## What Render needs

| Check | Status | Note |
|---|---|---|
| Single web process (no separate frontend) | Pass | Next.js App Router serves UI + `/api/*` |
| Bind `0.0.0.0` | Pass | `scripts/start.cjs` passes `-H 0.0.0.0` |
| Honour `PORT` | Pass | `process.env.PORT` |
| Health check `GET /api/health` → 200 | Pass | Now survives a failed disk write |
| Build: TypeScript + Tailwind present | Pass | `npm ci --include=dev && npm run build` |
| `next` available at runtime | Pass | listed in `dependencies`, not only dev |
| Secrets not in git | Pass | `.env.local` gitignored |
| HTTPS cookies | Pass | `Secure` when `NODE_ENV=production` |
| SIGTERM forwarded on deploy | Pass | start script now kills the Next child |
| Node version pinned | Pass | `engines` + `NODE_VERSION=22.12.0` |
| Region | Pass | Frankfurt (closest common region to Accra) |

## What is *not* perfect on free Render

1. **Ephemeral disk.** `data/db.json` (CMS edits, chats, uploaded series) dies on every restart or spin-down. The site still boots. Re-enter official CSVs after a sleep if you care.
2. **Cold start 30–60s.** First hit after idle looks like a hang. That is the box waking, not OpenRouter.
3. **512 MB RAM at runtime.** Forecast + vision + a large PDF in memory can get tight. Upgrade the instance if you see OOM kills.
4. **`sync: false` env vars.** Blueprint will sit waiting until you paste `OPENROUTER_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`. Empty OpenRouter does not crash the site — forecasts still run locally.
5. **OpenRouter 402.** Empty credit balance stops every model. Health still returns 200.
6. **No Postgres on this blueprint.** Add a Render disk or `DATABASE_URL` later if the viva needs durable CMS.

## Fixed in this pass

- `persist()` no longer throws → health check cannot 500 because of a read-only disk.
- Health handler swallows store errors and still returns `{ ok: true }`.
- Start script forwards SIGTERM/SIGINT so Render deploys do not hang.
- Node 22 pinned for the blueprint.

## Deploy recipe (unchanged path)

Dashboard → New → Blueprint → repo `ThaddeusHackz/ONE-HEALTH` → branch `arena/01a01814-one-health` → fill secrets → Apply.

Manual: Web Service, Node, build `npm ci --include=dev && npm run build`, start `npm start`, health `/api/health`.
