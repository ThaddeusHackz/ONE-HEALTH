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
     `fetch` from Node to duckduckgo.com, generativelanguage.googleapis.com, api.tavily.com,
     api.unsplash.com and cdn.jsdelivr.net fails with `fetch failed`, and `curl` to the
     four sites returns HTTP 000. So no live probe of any external service was possible
     here.
  2. Those front ends are authenticated single-page apps; their DOM is produced at
     runtime from minified bundles, which is not a source of reliable component
     inventory even with network access.
* **Consequence for this repo:** every live-API code path (Gemini chat/stream/tools,
  Gemini vision/images/speech, Tavily, Unsplash, ElevenLabs) is written against the
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
| Advanced Voice | MediaRecorder → Gemini speech-to-text in, ElevenLabs/Gemini TTS/browser out |
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
| Designer / image generation, model choice | `image_generate` with an overridable model chain (`GEMINI_IMAGE_MODELS`) |
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

### Gemini — the ONE engine (`GEMINI_API_KEY`, Google AI Studio)

Base `https://generativelanguage.googleapis.com/v1beta`, auth header `x-goog-api-key`.
Every AI capability on this platform is one of these calls. There is no second provider.

| Job | Endpoint | Contract |
|---|---|---|
| Chat / reasoning | `POST /models/{model}:generateContent` | `{contents:[{role,parts}], systemInstruction, generationConfig}`; **one model per request** — the slug is in the URL, so the chain is walked one at a time |
| Streaming | `POST /models/{model}:streamGenerateContent?alt=sse` | SSE `data:` frames carrying `candidates[0].content.parts[]` |
| Tool calling | same, plus `tools:[{functionDeclarations}]` + `toolConfig.functionCallingConfig.mode:"AUTO"` | calls come back as `functionCall` parts; results go back as `functionResponse` parts on a user turn (Gemini has no tool role and no call ids) |
| Schema dialect | `functionDeclarations[].parameters` | OpenAPI-ish: `$schema`, `additionalProperties`, `exclusiveMinimum`, `oneOf` … are **rejected** — `sanitizeSchema()` in `lib/llm.ts` strips them |
| Vision | same endpoint | `inlineData:{mimeType,data}` parts; images **and** PDFs; 20 MB inline request cap |
| Catalogue | `GET /models` | what THIS key may call; used to filter retired slugs before a request goes out |
| Image generation | `POST /models/{model}:generateContent` | `generationConfig.responseModalities:["TEXT","IMAGE"]`; image at `candidates[0].content.parts[].inlineData.data` (REST may use `inline_data`) |
| TTS | `POST /models/{model}:generateContent` | `responseModalities:["AUDIO"]` + `speechConfig.voiceConfig.prebuiltVoiceConfig`; returns **raw s16le PCM @24 kHz**, so `/api/tts` prepends a WAV header |
| STT | `POST /models/{model}:generateContent` | audio as an `inlineData` part + a "transcribe verbatim" prompt |
| Thinking models | `generationConfig.thinkingConfig` | 2.5+ spend the output budget on hidden reasoning first — with a small `maxOutputTokens` they return `MAX_TOKENS` and **no text**, which looks exactly like a dead key. Thinking is disabled on attempt 1; attempt 2 drops `thinkingConfig` and doubles the budget |
| Hidden reasoning | response parts flagged `thought:true` | never returned as the answer; routed to the reasoning channel |

Implemented in `lib/llm.ts` (the engine), `lib/agent/gemini.ts` (vision + ping),
`lib/agent/media.ts` (images), `app/api/tts/route.ts`, `app/api/transcribe/route.ts`.

**Error taxonomy** (`lib/llm.ts`): `GeminiRouterError` carries `status`, `model` and a
`kind` of `auth` (400/401/403 "API key not valid" → stop the chain at once, a retry can
only waste time), `quota` (429 → next model, then the free-tier models), `dead_model`
(404 → cache the slug dead for the process), `tool_rejected` (retry the same model with
no tools), `transient` (5xx/network → next model) or `empty` (a candidate with no text —
never allowed to pass as an answer).

The three task layers built on the engine:

1. **Vision** — photos, PDFs and documents as `inlineData` parts
   (`geminiVision`, used by `vision_read`, the Vision Lab and One Health ingest).
   Thinking is disabled on the first attempt so a read can never starve its
   output budget; quota rotates down the model chain; a bad key is a named auth
   error. **A file is never described unless a model actually saw it.**
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

### Speech-to-text
There is no separate transcription vendor. `/api/transcribe` sends the recorded audio to
Gemini as an `inlineData` part with a verbatim-transcription instruction, on the same
`GEMINI_API_KEY`. Without a key the route returns guidance to use the browser's Web
Speech dictation instead of failing. Audio above ~18 MB is refused up front rather than
sent into Gemini's ~20 MB inline request cap.

---

## 6. Decisions that came out of the scan

1. **Sandbox in the browser, not on the host.** Arena runs bash in a managed VM; a free
   Render web service has no VM boundary, so model-written code executing there would be
   a remote-code-execution hole on a government health platform. The opaque-origin iframe
   gives real isolation (no cookies, no storage, no parent DOM, no credentialed fetch) at
   the cost of network access from inside the sandbox.
2. **Closed tool surface, no MCP.** Every capability is a declared, auditable tool in
   `lib/agent/tools.ts`. Nothing can be added at runtime by a prompt.
3. **One key, one engine.** Chat, tools, vision, research, images and speech all run on
   `GEMINI_API_KEY`. One credential to set, one quota to watch, one place to look when
   something stops answering — and no possibility of the "which key was that?" class of
   bug. The cost is stated plainly: an exhausted quota takes every AI surface down at
   once, and `/api/diagnostics` reports exactly that.
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
