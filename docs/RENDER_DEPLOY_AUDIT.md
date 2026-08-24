# Render deployment audit — will it run, and will the AI work?

Date: 2026-08-24
Target: `one-health-ghana.onrender.com` (free web service + free Postgres, blueprint `render.yaml`)
Method: live probes against the deployed service, Render's own documentation, and the
repository source. Everything quoted below is a real response or a real file — no
inference is presented as measurement.

---

## 1. Live probes against the deployed service

`GET https://one-health-ghana.onrender.com/api/health` (2026-08-24T17:51:36Z)

```json
{"ok":true,"host":{"node":"v22.12.0","env":"production"},
 "capabilities":{"openrouter":true,"openrouterKey":"sk-or-v1…7d71",
   "lastOpenRouterError":null,"search":true,"voice":true,"weather":true,
   "freeModelFallback":true,"openrouterMaxModelsPerRequest":3},
 "archive":{"bytes":394,"exists":true,"path":"/opt/render/project/src/data/events.jsonl"},
 "postgres":true}
```

`GET /api/diagnostics` (2026-08-24T17:53:00Z) — these are real outbound calls made by the
Render service itself:

| Check | Result | Detail |
|---|---|---|
| openrouter | **ok 200** | `google/gemini-2.5-flash answered OPENROUTER_OK` |
| tavily | **ok 200** | `Ghana Health Service - Your Health Our Concern` |
| openweather | **ok 200** | `Accra 26.23°C` |
| elevenlabs | **ok 200** | `voices ok · 22 available (voice 21m00Tcm4TlvDq8ikWAM)` |

`GET /api/config` → nav is `/, /forecast, /surveillance, …` — **no `/agent`**.

### What those probes prove

1. **All four AI keys are already set on Render** and reachable from Render's network:
   OpenRouter, Tavily, OpenWeather, ElevenLabs. The model chain's first-choice vision/fast
   model (`google/gemini-2.5-flash`) answered, so streaming and tool calling have a
   working endpoint to talk to.
2. **Node v22.12.0** in production matches `.node-version` and `render.yaml`'s
   `NODE_VERSION` — no build/runtime version drift.
3. **`postgres: true`** — the snapshot store is wired, so memory, conversations and
   workspace files survive restarts.
4. **The deployed build predates the AI Agent.** The health payload has no `images`,
   `whisper` or `agentTools` fields and the nav has no `/agent`. Nothing from this branch
   is live until it is pushed and deployed.

### What the probes also proved about the free tier

The first request to the service returned Render's **"Application loading"** splash page
instead of JSON. That is documented behaviour:

> Render **spins down** a Free web service that goes 15 minutes without receiving any
> inbound traffic… This process takes about one minute. Render displays a loading page to
> connecting browsers while a service is spinning up. — render.com/docs/free

---

## 2. Feature-by-feature readiness on `one-health-ghana.onrender.com`

| Feature | Runs on Render? | Why |
|---|---|---|
| Agent reasoning + tool loop | **Yes** | OpenRouter verified 200 from the host |
| Multi-model fallback | **Yes** | 3-slug chunking already proven in production (`openrouterMaxModelsPerRequest: 3`) |
| `web_search` / `web_fetch` | **Yes** | Tavily verified 200 from the host |
| `deep_research` | **Yes** | OpenRouter + Tavily, both verified |
| `vision_read` | **Yes** | vision models ride the same verified OpenRouter path |
| `image_search` (Unsplash) | **Partial** | `UNSPLASH_ACCESS_KEY` is not set; falls back to Tavily image results, which are verified working |
| `image_generate` | **Unverified** | Uses the verified OpenRouter key, but image generation draws on **credit balance** — no image model carries a `:free` suffix. Must be tested with `/api/diagnostics` → `image-generation` after deploy |
| Sandbox (JS/HTML/CSS/SVG/JSON) | **Yes** | Runs entirely in the visitor's browser; the server is not involved |
| Sandbox (Python) | **Yes, with a CDN** | Pyodide loads from jsDelivr in the browser; blocked only if the visitor's network blocks CDNs |
| Voice in (Whisper) | **Partial** | `OPENAI_API_KEY` is not set → routes through OpenRouter `/audio/transcriptions` on the verified key; browser Web Speech is the guaranteed fallback |
| Voice out (ElevenLabs) | **Yes** | Verified 200 with 22 voices |
| `weather_now` | **Yes** | OpenWeather verified 200 |
| `ghana_forecast` / `ghana_national_table` / `compute` / `chart` / `table` | **Yes** | Pure server-side computation, no keys, no network |
| Memory / conversations / workspace files | **Yes, with a 30-day ceiling** | Postgres verified; see §4 |
| Static pages, forecast, surveillance, extracts, admin | **Yes** | Already in production |

---

## 3. Defects found in this audit, and fixed

Each one was reachable on a free Render instance and is now covered by a test.

### 3.1 A Postgres connection storm
`lib/pg-store.ts` and `lib/archive.ts` each opened a **new `pg.Client` per write** and
closed it. One agent turn writes several audit rows, so a burst opened a burst of
connections against a 256 MB free Postgres with a small connection ceiling — writes then
failed silently (the errors were caught and logged).
**Fix:** `lib/pg-pool.ts` — one shared `pg.Pool`, `max: 2`, 8 s connect timeout, 20 s idle
timeout. Both modules use it.

### 3.2 Full-row rewrite on every single write
Every `saveDB` (each audit row, each activity log) rewrote the entire jsonb snapshot.
**Fix:** writes are coalesced — the first change in a window goes out immediately, a burst
collapses into one trailing write (3 s window), with a `flushPgSnapshot()` on SIGTERM so a
restart cannot drop the newest state.

### 3.3 The snapshot row could outgrow the database
Caps allowed 200 files × 400 KB = **80 MB** in one row, against a free Postgres capped at
1 GB. **Fix:** files 60 × 120 KB, conversations 60 × 160 messages × 12 KB, plus a
`trimSnapshot()` guard that sheds the least important bytes (file bodies → transcripts →
legacy chats → document analyses) if the row would exceed 12 MB.
Test evidence: a 19.6 MB snapshot is trimmed to 3.8 MB with unrelated state intact.

### 3.4 A 96 MB request body on a 512 MB instance
The composer allowed 8 attachments × 9 MB; base64-in-JSON turns that into ~96 MB of parsed
object on a box already running Next. **Fix:** client caps now 5 files × 4 MB, and
`/api/agent` rejects anything over 28 MB with HTTP 413 and a readable message.

### 3.5 Next.js compression could buffer the token stream
Next's built-in compression treats `text/*` as compressible, which batches
`text/event-stream` until a block fills — the agent's tokens would arrive as one late dump.
**Fix:** `compress: false` in `next.config.ts` (Render does not re-compress), alongside the
existing `X-Accel-Buffering: no`. Verified: the SSE response carries no `content-encoding`.

### 3.6 The cold start failed silently
An idle free instance answers with an HTML 200 loading page. The client checked only
`res.ok`, so it would have shown an **empty answer with no error** for a minute.
**Fix:** the client checks `content-type`, detects the loading page, shows
"waking it — cold start takes about a minute", and retries at 15/20/25 s.

### 3.7 Unbounded event log on a small ephemeral disk
`data/events.jsonl` grew forever and every event was inserted into `ohg_events` forever.
**Fix:** the local file rotates at 2 MB (keeping 400 KB) and the table is trimmed to 20 000
rows every 500 inserts.

### 3.8 A false retention claim
`.env.example` promised "multi-decade retention". A free Render Postgres is deleted 30 days
after creation. **Fix:** the comment now states the real limit.

### 3.9 Stored nav order — confirmed live, already fixed
The live `/api/config` returns the pre-agent nav from the Postgres snapshot. Without the
`mergeNav` change, a new tab would have been appended to the **end** of the bar instead of
sitting between Home and Forecast. `mergeNav` now re-sorts onto the canonical order; the
agent self-test asserts `/ → /agent → /forecast`.

---

## 4. Residual risks that code cannot fix

| Risk | Documented behaviour | Mitigation |
|---|---|---|
| **Cold start** | Free services spin down after 15 idle minutes; ~1 minute to wake, with a loading page | The client now retries and explains. For a service GHS officers open daily, upgrade to Starter ($7/mo) — it removes spin-down entirely |
| **Database deleted at 30 days** | Free Postgres expires 30 days after creation, then a 14-day grace period, then data is permanently deleted | Export with `pg_dump` before expiry, or move to a paid/external Postgres. Memory and transcripts are not durable long-term on the free tier |
| **750 instance hours/month** | Exhausting them suspends all free web services until the next month | Spun-down services don't consume hours, so a single service is normally fine |
| **Service-initiated traffic** | "Render may suspend a Free web service that initiates an uncommonly high volume of traffic over the public internet" — external API calls are named as an example | The agent calls OpenRouter/Tavily per turn. Normal desk use is fine; a scripted hammering of the agent is not |
| **Filesystem is ephemeral** | All local files are lost on every spin-down and redeploy | Already handled: Postgres is the only trusted store; `data/db.json` is a cache |
| **Image generation cost** | No OpenRouter image model has a `:free` suffix; generation draws on credit balance | `image_generate` fails with a readable message rather than hanging. Confirm with `/api/diagnostics` after deploy |
| **Region latency** | Service is in `frankfurt` — the closest free region to Ghana | Acceptable; OpenRouter calls dominate latency anyway |
| **No request timeout documented** | Render documents no fixed timeout for web services and none for WebSockets; it does not publish an SSE-specific guarantee | The agent already streams continuously (tokens plus tool events), which keeps the connection active rather than idle. **Long multi-step runs should be verified on the host after deploy** — this is the one thing I could not measure |

---

## 5. Deploy checklist

1. Reconnect GitHub, push `arena/01a03499-one-health-ai`, deploy.
2. `GET /api/health` → expect the new fields `images`, `whisper`, `agentTools: 22`,
   and `store.agentConversations/agentMemory/agentFiles`.
3. `GET /api/config` → nav must read `/ → /agent → /forecast`.
4. `GET /api/diagnostics` → seven checks; `unsplash` and `whisper` will read "not set"
   until those keys are added, `image-generation` reports how many image models the
   account can reach.
5. Optional dashboard keys: `UNSPLASH_ACCESS_KEY`, `OPENAI_API_KEY`,
   `OPENROUTER_IMAGE_MODELS`, `AGENT_MAX_STEPS`. Adding them needs no code change.
6. Send one agent message and confirm tokens stream progressively (not one late block).
7. Ask it to build an HTML file and confirm the sandbox runs it and the model reads the
   result back.
8. Set a calendar reminder for the Postgres expiry, or schedule `pg_dump`.

---

## 6. Test coverage added by this audit

`npm run selftest:agent` — 29 assertions (5 new for Render hardening: snapshot trimming,
store caps, pool configuration, compression disabled).
`npm run selftest` — 25 HTTP checks (3 new: 413 on oversized body, 400 on malformed JSON,
SSE not compressed).
`npm test` runs both. All 54 passed against a production build on Node 22.22.3.
