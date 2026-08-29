# ONE HEALTH AI Agent — capability dossier

Date: 2026-08-24
Tab: `/agent` (navigation position 2, between **Home** and **Forecast**)
Owner: Ghana Health Service ONE HEALTH platform

This is the workbook page for the agent: what it can do, which key each capability
runs on, how it fails, and what it refuses. Everything below is implemented in this
repository — file paths are given so any claim can be checked.

---

## 1. The shape of it

```
app/agent/page.tsx                  three-pane desk (history · conversation · workspace)
app/agent/layout.tsx                metadata
components/agent/useAgent.ts        SSE client, tool events, sandbox handshake, persistence
components/agent/AgentComposer.tsx  input, attachments, voice, modes, tool toggles
components/agent/AgentMessage.tsx   markdown, tools, citations, charts, tables, images, files
components/agent/AgentWorkspace.tsx Preview · Code · Files · Console · Memory
components/agent/SandboxFrame.tsx   the isolated execution environment
components/agent/Charts.tsx         Recharts + table renderers
components/agent/Diagram.tsx        Mermaid -> SVG: zoom, pan, source, SVG/PNG export
components/agent/Voice.tsx          Whisper in, ElevenLabs/OpenRouter/browser out

app/api/agent/route.ts              POST = SSE stream; GET = tool registry
app/api/agent/memory/route.ts       facts + conversations
app/api/agent/files/route.ts        workspace filesystem
app/api/agent/images/route.ts       direct image generation
app/api/transcribe/route.ts         speech → text (3 tiers)
app/api/tts/route.ts                text → speech (3 tiers)

lib/agent/run.ts                    the agentic loop
lib/agent/tools.ts                  23 tool declarations + executors + system prompt
lib/agent/diagram.ts                Mermaid normaliser + validator (pure, no DOM)
lib/agent/memory.ts                 facts, conversations, files, memory distillation
lib/agent/web.ts                    Tavily + DuckDuckGo + page reader (SSRF-guarded)
lib/agent/media.ts                  Unsplash search + Gemini image generation
lib/agent/deep-research.ts          decompose → parallel search → read → synthesise
lib/agent/compute.ts                deterministic expression engine (no eval)
lib/openrouter.ts                   model chain, 3-slug chunking, streaming, tool calling
```

---

## 2. Capabilities, and the key each one runs on

| Capability | Tool / surface | Key required | Without the key |
|---|---|---|---|
| Reasoning, planning, writing, code | agentic loop | `OPENROUTER_API_KEY` | offline notice; local desks still work |
| Model resilience | 15-model chain in groups of 3, live-catalogue filtering, `:free` fallback | `OPENROUTER_API_KEY` | — |
| Live web search | `web_search` | `TAVILY_API_KEY` | DuckDuckGo HTML scrape |
| Read a page | `web_fetch` | none | always available (SSRF-guarded) |
| Multi-step sourced research | `deep_research` | `GEMINI_API_KEY` (+ Tavily) | raw source list only |
| Vision on any attachment | `vision_read` (Gemini engine, every mode) | `GEMINI_API_KEY` | loud refusal - never a blind answer |
| Generate new images | `image_generate` | `GEMINI_API_KEY` | clean failure message |
| Real stock photography | `image_search` | `UNSPLASH_ACCESS_KEY` | Tavily image results |
| Code sandbox (JS/HTML/CSS/SVG/JSON/CSV/Markdown) | `sandbox_exec` | none | always available |
| Mermaid sandbox preview | `sandbox_exec` language `mermaid` | none (needs CDN) | source shown if CDN blocked |
| Python sandbox | `sandbox_exec` + Pyodide CDN | none (needs network) | clear error if CDN blocked |
| Workspace files | `create_file`, `list_files`, `read_file`, `delete_file` | none | always available; Postgres makes it durable |
| Charts | `chart` | none | always available |
| Diagrams / flowcharts | `diagram` (Mermaid) or a ```mermaid fence | none | always available |
| Tables | `table` | none | always available |
| Deterministic maths/stats | `compute` | none | always available |
| Ghana ensemble forecast | `ghana_forecast` | none | always available |
| National signal board | `ghana_national_table` | none | always available |
| Climate signals | `weather_now` | `OPENWEATHER_API_KEY` | climatic placeholders |
| Long-term memory | `memory_save`, `memory_recall`, auto-distillation | none (distillation needs OpenRouter) | manual facts still work |
| Visible planning | `plan` | `OPENROUTER_API_KEY` | — |
| Clarifying questions | `ask_user` (browser) | `OPENROUTER_API_KEY` | — |
| Voice in | MediaRecorder → `/api/transcribe` | `OPENAI_API_KEY` → OpenRouter → Web Speech | browser dictation |
| Voice out | `/api/tts` | `ELEVENLABS_API_KEY` → OpenRouter → `speechSynthesis` | device voice |
| Conversation history | `/api/agent/memory` | none | localStorage mirror in the browser |

---

## 3. The agentic loop, exactly as built

`lib/agent/run.ts`

1. Build the system prompt: Ghana One Health context + mode hint + recalled memory +
   attachment manifest.
2. Redact the user's text (`lib/redact.ts`) before it leaves the instance.
3. Attach up to six files to the user turn: images as `image_url` parts, PDFs as `file`
   parts, text as an inline excerpt.
4. Stream from OpenRouter with `tools` + `tool_choice: "auto"`.
5. Deltas go to the browser as `event: delta`; reasoning tokens as `event: reasoning`.
6. Tool calls are answered in order; each result goes back as a `role: "tool"` message
   and the loop continues — up to `AGENT_MAX_STEPS` (default 8, max 24).
7. Two tools cannot run server-side. `sandbox_exec` and `ask_user` pause the stream:
   the server emits `event: sandbox_request` (or `ask`), the browser executes or asks,
   then POSTs the answer back with the paused transcript. Base64 payloads are stripped
   from that round trip.
8. On completion the conversation is persisted and durable facts are distilled in the
   background — never blocking the reply.

**Fallback behaviour** (`lib/openrouter.ts`): three slugs per request is an OpenRouter
limit, so the 17-model chain is walked in groups of six groups; a 401/403 stops
immediately with a readable message; a 402 retries on the `:free` pool; providers that
reject `tools` are retried without them so a tool-capable turn can never hard-fail.

---

## 4. The sandbox

`components/agent/SandboxFrame.tsx`

* Two `<iframe>` elements with `sandbox="allow-scripts"` — **no** `allow-same-origin`,
  so the code runs on an opaque origin: no cookies, no localStorage, no DOM access to
  the parent, no credentialed requests.
* The runner frame is hidden and permanent; it captures `console.*`, `window.onerror`
  and unhandled rejections, and reports stdout, return value, error and elapsed time.
* Languages: `javascript`, `html`, `python` (Pyodide 0.26.4 from jsDelivr, downloaded on
  first run), `css`, `svg`, `mermaid` (rendered as a diagram), `json`, `csv` (rendered as
  a table), `markdown` (rendered, HTML escaped before any substitution).
* The preview frame renders HTML/SVG/CSS/Mermaid/CSV/Markdown artefacts.
* Manual use: the **Code** tab has an editor and a Run button; the **Console** tab has a
  REPL line.
* `sandbox_exec` accepts an optional `filename`; the browser saves that code into the
  workspace and shows it as a file card, so a verified artefact is also a download.

### The sandbox is a drawer, not a column

The workspace (Preview · Code · Files · Console · Memory) slides in from the right over
the conversation and slides back out on the same button, `Esc`, or the backdrop. It is
`min(60rem, 96vw)` wide and full height, so an artefact is readable at real size, and the
conversation keeps the full width of the screen while it is closed. The runner iframe
stays mounted while the drawer is off-screen, so an agent `sandbox_exec` call can never
land on an unmounted sandbox.

Deliberately **not** provided: server-side `eval`, `child_process`, or any network
access from inside the sandbox. Untrusted model-written code never touches the Render
filesystem.

---

## 4b. Diagrams and flowcharts

`lib/agent/diagram.ts` (pure TS, runs server and browser) · `components/agent/Diagram.tsx`

Mermaid is the diagram interchange ChatGPT, Claude artifacts and Microsoft 365 Copilot all
use: the model writes text, a renderer produces SVG, and the intent stays auditable. Two
routes in — the `diagram` tool, or a ` ```mermaid ` fence in an answer. Both render with
zoom, pan, full screen, source toggle and SVG/PNG export.

Two hardening steps, because both commercial products had to learn them:

1. **Repair, then validate.** Models emit broken Mermaid constantly. `prepareDiagram`
   fixes typographic quotes, stray code fences, the reserved word `end` used as a node,
   unquoted punctuation in labels and multi-word subgraph titles — and reports every
   repair in the caption. What is left is then structurally validated, so a bad diagram
   returns the model a line number and a list of valid types instead of a blank box. On
   the client a parse failure shows the error *and* the source, so nothing is lost.
2. **Strip interactivity.** Mermaid supports `click Node "https://…"` and `%%{init}%%`
   theme injection. Microsoft removed those from rendered diagrams after a documented
   payload exfiltrated tenant data through a "login button" flowchart. Measured here:
   `securityLevel: "strict"` alone disables JS callbacks but **still emits
   `<a href="…">`** with the attacker URL. So the directive is removed before rendering,
   and the rendered SVG is scrubbed of `href`, handlers and scripts as a second layer.
   Verified end-to-end: the payload renders legibly with no URL, no anchor and no handler.

`htmlLabels: false` keeps node text as real SVG `<text>` so PNG export works in browsers
that refuse to rasterise `<foreignObject>`. Mermaid is imported dynamically — it is a
separate chunk, not part of the agent's first paint.

---

## 5. Memory — how the agent evolves

`lib/agent/memory.ts`

* **Facts** — up to 400, keyword-recalled into the system prompt each turn, hit-counted
  so frequently useful facts rank higher, visible and deletable in the Workspace panel.
* **Auto-distillation** — after a substantive turn, a cheap model pass extracts up to
  five durable facts. Anything matching `api_key|password|token|secret` is dropped.
* **Conversations** — up to 120, restorable from the history rail.
* **Files** — up to 200 workspace artefacts, 400 KB each.
* All four stores live in the same snapshot row as the rest of the platform
  (`lib/pg-store.ts`), so on Render with `DATABASE_URL` they survive restarts.

---

## 6. Guardrails

| Guard | Where |
|---|---|
| No patient names, phones, folder numbers in prompts | `lib/redact.ts`, applied in `run.ts` |
| No secrets into memory | `memory_save` + distiller both refuse |
| No SSRF from `web_fetch` | `lib/agent/web.ts` — loopback, link-local and RFC1918 hosts refused |
| No `eval`/`Function` on user maths | `lib/agent/compute.ts` is a hand-written parser |
| No untrusted code on the server | sandbox is browser-side, opaque origin |
| Attachments capped | 8 per turn, 9 MB each, 6 sent to the model |
| Prompt/output caps | tool output truncated at 12 KB, files at 400 KB |
| Interval discipline | system prompt: "no error-free future", "an alert is an investigation prompt" |

---

## 7. Known limits (stated, not hidden)

1. **No API key means no brain.** The loop, research, vision and image generation all
   need `OPENROUTER_API_KEY`. The local statistical desks do not.
2. **Image generation is a separate key.** It runs on the Gemini API, not OpenRouter, so
   `GEMINI_API_KEY` must be set even when reasoning works. Gemini has its own free-tier
   rate limits and its own billing.
3. **Pyodide needs the CDN.** A locked-down browser or an offline client cannot run
   Python; JavaScript/HTML still run.
4. **Memory recall is keyword-based**, not embedding-based. It is deterministic and
   free, and it will miss paraphrases.
5. **The sandbox cannot reach the network.** By design — a dashboard built there must be
   self-contained or fetch through our own API from the parent page.
6. **No video generation.** Not wired.
8. **No Imagen.** Google shut the Imagen endpoints down on 2026-08-17, so the chain is
   Gemini-native image models only.
7. **No MCP / external connectors.** The tool surface is closed and auditable by design.

---

## 8. Verification

| Command | What it proves |
|---|---|
| `npm run typecheck` | `tsc --noEmit` over the whole repo |
| `npm run build` | production build, `/agent` route emitted |
| `npm run selftest:agent` | compiles `lib/` with the project's own tsc and drives the **real** `runTool`, `evaluateExpression`, memory and store code — 24 assertions |
| `npm run selftest` | 22 HTTP checks against a running server, including the agent registry, nav position, memory CRUD, file round-trip, SSE stream and the `/agent` page render |
| `npm test` | both suites |

Last run: 24/24 agent assertions and 22/22 HTTP checks passed.
