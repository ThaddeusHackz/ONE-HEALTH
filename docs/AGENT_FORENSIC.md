# Forensic scan — agent surfaces and the APIs behind them

Date: 2026-08-24
Scope: `chatgpt.com`, `claude.ai`, `copilot.microsoft.com`, `arena.ai/agent`, and the API
contracts the ONE HEALTH AI Agent is built against.

## 0. Method, and its honest limits

* **Examined:** published product documentation, official release notes, vendor blogs and
  API references for each product, retrieved through the research tooling available to this
  session.
* **Not examined:** the client-side JavaScript bundles of the four sites. Two reasons,
  both verifiable:
  1. The build sandbox for this repository has **no outbound network** — every
     `fetch` from Node to duckduckgo.com, openrouter.ai, api.tavily.com,
     api.unsplash.com and cdn.jsdelivr.net fails with `fetch failed`, and `curl` to the
     four sites returns HTTP 000. So no live probe of any external service was possible
     here.
  2. Those front ends are authenticated single-page apps; their DOM is produced at
     runtime from minified bundles, which is not a source of reliable component
     inventory even with network access.
* **Consequence for this repo:** every live-API code path (OpenRouter chat/stream/tools,
  OpenRouter images, Tavily, Unsplash, OpenAI Whisper, ElevenLabs) is written against the
  documented contract and is covered by graceful-degradation tests, but **was not executed
  against the real service in this session**. It must be verified on Render with keys set
  — `GET /api/diagnostics` is the probe for that.

---

## 1. ChatGPT (chatgpt.com) — interface and capability inventory

Composer-side components observed in the published inventory: `+` menu (upload, Agent Mode,
Deep Research, Image generation, Connectors, Study & Learn, Web search, Canvas, Voice),
model selector, sidebar with Projects and Settings, conversation list, inline citations.

| Capability | Shipped here as |
|---|---|
| Web search with inline citations | `web_search` + `citations` event chips |
| Deep Research (multi-step, sourced report) | `deep_research` (decompose → parallel search → read pages → cited brief) |
| Canvas / side-by-side artefact editing | Workspace panel: Preview / Code / Files tabs |
| Code Interpreter (Python sandbox) | `sandbox_exec` with Pyodide in an opaque-origin iframe |
| Image generation | `image_generate` via the Gemini image models |
| Image input / screenshot reading | attachments + `vision_read` |
| Advanced Voice | MediaRecorder → Whisper (3-tier) in, ElevenLabs/OpenRouter/browser out |
| Memory across conversations | `lib/agent/memory.ts` + auto-distillation |
| Projects / conversation persistence | server-side conversation store + history rail |
| Custom GPTs / personas | five modes (Chat, Deep Research, Builder, Vision, One Health) + tool toggles |
| Tasks / scheduled runs | **not shipped** — no scheduler on a Render free instance |
| Connectors / MCP | **not shipped by design** — closed, auditable tool surface |

## 2. Claude (claude.ai)

| Capability | Shipped here as |
|---|---|
| Artifacts (code, HTML, SVG, React, Mermaid, Markdown in a side panel) | Workspace Preview + `create_file` artefacts |
| Editable / versioned artefacts | Code tab editor, Save, download, delete |
| Projects (persistent instructions + files) | workspace filesystem + long-term memory |
| Research mode (agentic multi-source reports) | `deep_research` |
| Memory (chat memory, viewable/deletable) | Memory tab: list, add, delete, clear |
| Code execution tool (sandboxed Python) | Pyodide sandbox |
| Extended / adaptive thinking | `reasoning: {effort:"medium"}` + visible reasoning panel |
| Computer use | **not shipped** — unsafe and out of scope for a public health desk |
| Skills / plugins / MCP | **not shipped by design** |

## 3. Microsoft Copilot (copilot.microsoft.com)

| Capability | Shipped here as |
|---|---|
| Quick Response vs Think Deeper | mode chips + "Think deeper" toggle |
| Copilot Vision | attachments + `vision_read` |
| Designer / image generation, model choice | `image_generate` with an overridable model chain (`OPENROUTER_IMAGE_MODELS`) |
| Deep Research with hover-to-source | `deep_research` + numbered citation chips |
| Notebooks / Pages (interactive documents) | `create_file` HTML artefacts run in the sandbox |
| Copilot Voice | Voice in/out |
| Memory and version history | memory store; conversation history |
| Microsoft 365 grounding | **not applicable** |

## 4. Arena Agent Mode (arena.ai/agent)

Published description of the harness: the agent gets **web search, image generation, file
writing, bash in a sandbox, and the ability to ask clarifying questions**; the workspace
panel on the right shows the files it created; models emit structured tool calls
(`create_file`, `edit_file`, `read_file`, `run_command`) that are logged step by step.

| Arena behaviour | Shipped here as |
|---|---|
| Structured tool calls, visible step-by-step | tool timeline in each answer (`tool_start` / `tool_result`) |
| Workspace file panel | Files tab, synced with the server store |
| Sandbox for testing and iteration | `sandbox_exec` with the result fed back to the model |
| Ask clarifying questions | `ask_user` → clickable option chips |
| Plan then execute | `plan` tool renders a numbered step list |
| bash on the host | **replaced by the browser sandbox** — see §6 |

---

## 5. API contracts verified against vendor documentation

These are the shapes the code is written to.

### OpenRouter
| Job | Endpoint | Contract |
|---|---|---|
| Chat / tools / streaming | `POST /api/v1/chat/completions` | OpenAI-compatible; `tools` + `tool_choice`; SSE `data:` frames; `delta.tool_calls[].function.arguments` streamed as fragments |
| Model routing | `models: [...]` | **at most 3 slugs per request**, otherwise HTTP 400 — hence the group-of-three walker already in `lib/openrouter.ts` |
| Image generation | `POST /api/v1/images` | `{model, prompt, aspect_ratio?, resolution?, input_references?}` → `{data:[{b64_json}], usage:{cost}}`; discovery at `GET /api/v1/images/models` |
| Image via chat | `POST /api/v1/chat/completions` | `modalities:["image","text"]`, images returned in `message.images[]` — used as the second fallback |
| Vision | `POST /api/v1/chat/completions` | `image_url` content part (public URL **or** base64 data URL); PDFs as `file` parts |
| TTS | `POST /api/v1/audio/speech` | text in, MP3/PCM bytes out |
| STT | `POST /api/v1/audio/transcriptions` | multipart audio in, `{text}` out |
| Image generation billing | — | no image model carries a `:free` suffix; generation draws on credit balance |

Implemented in `lib/agent/media.ts`, `lib/openrouter.ts`, `app/api/tts/route.ts`,
`app/api/transcribe/route.ts`.

### Gemini (the vision + research + image engine — the independent GEMINI_API_KEY)
`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`,
auth header `x-goog-api-key`. Three jobs, and ONLY these three:

1. **Vision** — photos, PDFs and documents as `inlineData` parts
   (`lib/agent/gemini.ts` `geminiVision`, used by `vision_read`, the Vision Lab
   and One Health ingest). Thinking is disabled on the first attempt so a read
   can never starve its output budget; quota rotates down the model chain; a
   bad key is a named auth error. **No OpenRouter fallback exists anywhere.**
2. **Deep research** — query decomposition + sourced synthesis
   (`lib/agent/deep-research.ts`), `responseMimeType: application/json` for the
   decompose step. No key → offline digest; outage → labelled raw digest.
3. **Image generation** — request
   `{contents:[{role:"user",parts:[{text},{inline_data?}]}], generationConfig:{responseModalities:["TEXT","IMAGE"], responseFormat:{image:{aspectRatio}}}}`.
   Response: `candidates[0].content.parts[].inlineData.data` (base64). REST payloads may use
   either `inlineData` or `inline_data`, so the parser in `lib/agent/media.ts` accepts both
   (`extractGeminiImage`, unit-tested for both shapes).

Text/vision model chain (newest cheap-first): `gemini-2.5-flash`, `gemini-2.5-pro`,
`gemini-2.0-flash`, `gemini-2.5-flash-lite` (the retired `gemini-1.5-pro` was removed),
overridable with `GEMINI_MODELS`. The base URL is overridable with
`GEMINI_API_BASE` for the forensic mock tests.

**Imagen is deliberately excluded.** Google shut the Imagen `:predict` endpoints down on
**2026-08-17**, so including them would only produce dead-model errors. The chain is
Gemini-native only: `gemini-2.5-flash-image`, `gemini-3.1-flash-image`,
`gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`,
`gemini-2.5-flash-image-preview`, overridable with `GEMINI_IMAGE_MODELS`.

Aspect-ratio config differs across model generations, so a 400 that mentions
`responseFormat`/`aspectRatio`/`imageConfig` is retried once without it. 401/403 stops the
chain with a readable key message; 429 moves to the next model.

### Tavily
`POST https://api.tavily.com/search`, auth via `Authorization: Bearer` **or** `api_key` in
the body. Parameters used: `query`, `search_depth`, `max_results`, `topic` (`general` |
`news`), `time_range`, `include_answer`, `include_raw_content`, `include_images`,
`include_image_descriptions`, `include_domains`, `exclude_domains`. Response:
`{answer, results:[{title,url,content,score,published_date,raw_content}], images:[]}`.
Implemented in `lib/agent/web.ts` and `lib/agent/media.ts`.

### Unsplash
`GET https://api.unsplash.com/search/photos?query=&per_page=&orientation=&content_filter=`,
header `Authorization: Client-ID <key>`, `Accept-Version: v1`. Response:
`{results:[{urls:{raw,regular,small}, alt_description, links:{html}, user:{name}}]}`.
Implemented in `lib/agent/media.ts`, with a Tavily-image fallback when the key is absent.

### OpenAI Whisper
`POST https://api.openai.com/v1/audio/transcriptions`, multipart `model` + `file`.
Models tried: `gpt-4o-mini-transcribe`, then `whisper-1`. An `sk-or-…` key is never sent
to `api.openai.com` — `whisperKey()` filters it (`lib/env.ts`).

---

## 6. Decisions that came out of the scan

1. **Sandbox in the browser, not on the host.** Arena runs bash in a managed VM; a free
   Render web service has no VM boundary, so model-written code executing there would be
   a remote-code-execution hole on a government health platform. The opaque-origin iframe
   gives real isolation (no cookies, no storage, no parent DOM, no credentialed fetch) at
   the cost of network access from inside the sandbox.
2. **Closed tool surface, no MCP.** Every capability is a declared, auditable tool in
   `lib/agent/tools.ts`. Nothing can be added at runtime by a prompt.
3. **Three-slug chunking everywhere.** The existing forensic finding (OpenRouter rejects
   more than three `models` entries) is reused by the streaming path, so tool calling
   inherits the same resilience.
4. **Streaming is mandatory for an agent UI.** `completeStream` exists because a
   multi-step turn can take a minute; a blocking request would look broken.
5. **Deterministic maths is a tool.** `compute` is a hand-written parser, not `eval`,
   because model-written arithmetic is the most common silent failure in agentic answers.

---

## 7. Not copied, deliberately

| Skipped | Why |
|---|---|
| Computer use / desktop control | No legitimate use on a health desk; large blast radius |
| Host-side shell | See decision 1 |
| MCP / third-party connectors | Unauditable data flows into a clinical-adjacent system |
| Scheduled/background tasks | Render free instances sleep; a cron would silently not run |
| Video generation | Async job API; no public-health use case yet |
| Persona marketplace | Governance risk, no benefit to GHS |
