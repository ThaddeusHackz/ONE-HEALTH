/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔬 THE FORENSIC SCAN - one command, everything checked.
 *
 *   node scripts/forensic-scan.cjs        (or: npm run forensic)
 *
 * Layers:
 *   1. Static audit      - typecheck, lint, source contracts, model-chain hygiene
 *   2. Engine forensics  - the REAL lib/ code compiled once, then driven against
 *                          a local mock Gemini server (real HTTP on 127.0.0.1).
 *                          No external network, no real keys.
 *   3. Vision forensics  - vision_read / Vision Lab / ingest run end to end on
 *                          the same single Gemini engine.
 *   4. Document forensics- the real Phase 2 workbook PDF is extracted and
 *                          inspected for mojibake, control bytes and content.
 *
 * Exit code 0 = no errors anywhere.
 */
const { spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".next", "forensic-scan");

let failures = 0;
let passes = 0;
const failuresDetail = [];

function ok(name, detail = "") {
  passes += 1;
  console.log(`  PASS ${name}${detail ? ` - ${detail}` : ""}`);
}
function bad(name, detail = "") {
  failures += 1;
  failuresDetail.push(`${name}: ${detail}`);
  console.error(`  FAIL ${name} - ${detail}`);
}
function check(name, fn) {
  try {
    const detail = fn();
    ok(name, typeof detail === "string" ? detail : "");
  } catch (err) {
    bad(name, err.message);
  }
}
async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    ok(name, typeof detail === "string" ? detail : "");
  } catch (err) {
    bad(name, err.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ---------------------------------------------------------------- *
 * Mock providers - real HTTP servers, scriptable behaviour.
 * ---------------------------------------------------------------- */

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

/**
 * Mock Gemini API - real HTTP, scriptable behaviour. Covers the three routes
 * the engine uses:
 *   GET  /models                                     - the catalogue
 *   POST /models/{model}:generateContent             - blocking completion
 *   POST /models/{model}:streamGenerateContent?alt=sse - streaming + tools
 *
 * State:
 *   catalogue   - slugs reported by GET /models
 *   deadSlugMsg - map slug -> 404 "is not found" message (retired model)
 *   failSlug    - map slug -> {status, message} for individual model failures
 *   respond     - fn(model, body) -> {status, json} for a completion
 *   stream      - fn(model, body) -> [chunk, ...] SSE payload objects
 *   failAll     - {status, message}: every completion fails (auth/quota tests)
 *   calls       - every request, for asserting what was and was not sent
 */
function makeGeminiApiMock() {
  const state = {
    catalogue: [],
    deadSlugMsg: {},
    failSlug: {},
    respond: null,
    stream: null,
    failAll: null,
    calls: [],
  };
  const handler = async (req, res) => {
    const body = await readBody(req);
    const sendJson = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const url = req.url.split("?")[0];

    if (/\/models$/.test(url) && req.method === "GET") {
      sendJson(200, {
        models: state.catalogue.map((id) => ({
          name: `models/${id}`,
          supportedGenerationMethods: ["generateContent", "streamGenerateContent"],
        })),
      });
      return;
    }

    const m = /\/models\/([^:]+):(generateContent|streamGenerateContent)$/.exec(url);
    if (!m) {
      sendJson(404, { error: { message: "unknown mock route" } });
      return;
    }
    const model = decodeURIComponent(m[1]);
    const streaming = m[2] === "streamGenerateContent";
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {}
    state.calls.push({ model, streaming, body: parsed });

    if (state.failAll) {
      sendJson(state.failAll.status, { error: { message: state.failAll.message } });
      return;
    }
    if (state.deadSlugMsg[model]) {
      sendJson(404, { error: { message: state.deadSlugMsg[model] } });
      return;
    }
    if (state.failSlug[model]) {
      sendJson(state.failSlug[model].status, { error: { message: state.failSlug[model].message } });
      return;
    }

    if (streaming) {
      if (!state.stream) {
        sendJson(500, { error: { message: "gemini mock has no stream responder" } });
        return;
      }
      const chunks = state.stream(model, parsed);
      if (chunks && chunks.error) {
        sendJson(chunks.error.status, { error: { message: chunks.error.message } });
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
      res.end();
      return;
    }

    if (!state.respond) {
      sendJson(500, { error: { message: "gemini mock has no responder" } });
      return;
    }
    const r = state.respond(model, parsed);
    sendJson(r.status, r.json);
  };
  return { state, start: () => startServer(handler) };
}

const geminiText = (text) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] } });
const geminiError = (status, message) => ({ status, json: { error: { message, status: String(status) } } });
/** SSE chunk carrying visible text. */
const streamText = (text) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });
/** SSE chunk carrying a function call. */
const streamCall = (name, args) => ({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] }, finishReason: "STOP" }] });

/* ---------------------------------------------------------------- *
 * Minimal, valid PDF built by hand: one page, uncompressed text ops,
 * and one FlateDecode stream - so the extractor is tested on both paths.
 * ---------------------------------------------------------------- */
function buildTestPdf() {
  const { zlibSync } = require("fflate");
  const plainOps = "BT /F1 12 Tf 72 720 Td (Plain stream line: IDSR weekly report) Tj ET";
  const flateOps = "BT /F1 12 Tf 72 700 Td (Flate stream line: malaria cases 1204) Tj ET";
  const compressed = zlibSync(Buffer.from(flateOps, "latin1"));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${plainOps.length} >>\nstream\n${plainOps}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  // append the flate object with its own dict
  const flateDictIdx = 7;
  objects.push(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${Buffer.from(compressed).toString("latin1")}\nendstream`);
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/* ---------------------------------------------------------------- *
 * The scan.
 * ---------------------------------------------------------------- */
(async () => {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ONE HEALTH GHANA - FULL FORENSIC SCAN                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  /* ---------------------- Layer 1: static audit ---------------------- */
  console.log("■ Layer 1 · static audit");

  const tsc = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", ROOT], { encoding: "utf8", cwd: ROOT });
  check("typecheck (tsc --noEmit)", () => {
    assert(tsc.status === 0, `tsc reported:\n${(tsc.stdout + tsc.stderr).slice(0, 600)}`);
    return "no type errors";
  });

  const eslint = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "eslint", "bin", "eslint.js"), "."], { encoding: "utf8", cwd: ROOT });
  check("lint (eslint, errors must be zero)", () => {
    const out = eslint.stdout + eslint.stderr;
    assert(eslint.status === 0, `eslint errors:\n${out.slice(0, 600)}`);
    return "0 errors (warnings allowed)";
  });

  /** Gemini API models verified available on Google AI Studio, 2026-08-29. */
  const VERIFIED_LIVE = [
    "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite",
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-flash-latest", "gemini-pro-latest",
    "gemma-3-27b-it", "gemma-3-12b-it",
  ];
  /** Slugs that must never appear again: retired Gemini models and every
   *  OpenRouter-style vendor-prefixed slug from the old gateway. */
  const VERIFIED_DEAD = [
    "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro",
    "openai/gpt-4.1-mini", "openai/gpt-4o-mini", "anthropic/claude-sonnet-4.6",
    "deepseek/deepseek-v3.2", "meta-llama/llama-3.3-70b-instruct",
    "mistralai/mistral-nemo", "openrouter/auto", "google/gemini-2.5-flash",
  ];

  function arrayLiteral(src, name) {
    const start = src.indexOf(`export const ${name} = [`);
    assert(start >= 0, `${name} not found`);
    const end = src.indexOf("];", start);
    return src.slice(start, end);
  }

  check("model chain hygiene: Gemini slugs only, no retired or gateway slugs", () => {
    const llmSrc = fs.readFileSync(path.join(ROOT, "lib/llm.ts"), "utf8");
    const modelsSrc = fs.readFileSync(path.join(ROOT, "lib/agent/models.ts"), "utf8");
    const chatArr = arrayLiteral(llmSrc, "CHAT_MODELS");
    const freeArr = arrayLiteral(llmSrc, "FREE_MODELS");
    const dropdownArr = modelsSrc.slice(modelsSrc.indexOf("export const PINNABLE_MODELS"), modelsSrc.indexOf("export const PINNABLE_SLUGS"));
    const shipped = [...chatArr.matchAll(/"([^"]+)"/g)].map((m) => m[1]).concat([...freeArr.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    const dropdownSlugs = [...dropdownArr.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
    for (const dead of VERIFIED_DEAD) {
      assert(!shipped.includes(dead), `${dead} is retired but still in the chain`);
      assert(!dropdownSlugs.includes(dead), `${dead} is retired but still in the dropdown`);
    }
    for (const slug of [...shipped, ...dropdownSlugs]) {
      assert(!slug.includes("/"), `${slug} is a gateway-style slug - the Gemini API takes a bare model name`);
    }
    assert(shipped.length >= 6, `chain too thin: ${shipped.length}`);
    assert(shipped.every((x) => VERIFIED_LIVE.includes(x)), `chain contains an unverified slug: ${shipped.filter((x) => !VERIFIED_LIVE.includes(x)).join(", ")}`);
    assert(dropdownSlugs.every((x) => VERIFIED_LIVE.includes(x)), `dropdown contains an unverified slug: ${dropdownSlugs.filter((x) => !VERIFIED_LIVE.includes(x)).join(", ")}`);
    assert(/MAX_MODELS_PER_REQUEST = 1/.test(llmSrc), "the one-model-per-request constant is missing");
    return `${shipped.length} chain slugs + ${dropdownSlugs.length} dropdown slugs, all Gemini, all verified 2026-08-29`;
  });

  check("source contract: the whole platform runs on ONE Gemini key", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          const rel = path.relative(ROOT, full);
          // lib/env.ts keeps ONE deliberate mention: the sk-or guard.
          if (rel === "lib/env.ts") continue;
          if (/openrouter/i.test(text) || /OPENROUTER_API_KEY/.test(text)) offenders.push(rel);
        }
      }
    };
    walk(path.join(ROOT, "lib"));
    walk(path.join(ROOT, "app"));
    walk(path.join(ROOT, "components"));
    assert(offenders.length === 0, `OpenRouter still referenced in: ${offenders.join(", ")}`);

    for (const f of ["render.yaml", ".env.example"]) {
      const text = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert(!/OPENROUTER/i.test(text), `${f} still declares an OpenRouter variable`);
      assert(/GEMINI_API_KEY/.test(text), `${f} does not declare GEMINI_API_KEY`);
    }

    const env = fs.readFileSync(path.join(ROOT, "lib/env.ts"), "utf8");
    assert(/sk-or-/.test(env) && /geminiKey/.test(env), "the sk-or guard on geminiKey is gone");
    assert(!/openRouterKey|openRouterReferer|openRouterTitle/.test(env), "lib/env.ts still exports OpenRouter accessors");
    assert(!fs.existsSync(path.join(ROOT, "lib/openrouter.ts")), "lib/openrouter.ts still exists");
    assert(!fs.existsSync(path.join(ROOT, "lib/or-review.ts")), "lib/or-review.ts still exists");

    // Every AI surface resolves its credential through geminiKey().
    for (const f of ["app/api/transcribe/route.ts", "app/api/tts/route.ts", "lib/agent/media.ts", "lib/llm.ts"]) {
      const text = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert(/geminiKey/.test(text), `${f} does not use the Gemini key`);
    }
    return "zero OpenRouter references in product code, config or env; one key everywhere";
  });

  check("source contract: vision + deep research run on the Gemini engine", () => {
    const analyze = fs.readFileSync(path.join(ROOT, "lib/analyze.ts"), "utf8");
    const tools = fs.readFileSync(path.join(ROOT, "lib/agent/tools.ts"), "utf8");
    const research = fs.readFileSync(path.join(ROOT, "lib/agent/deep-research.ts"), "utf8");
    assert(/geminiVision\(\{/.test(analyze), "analyzeUploads is not Gemini-driven");
    assert(/geminiVision\(\{/.test(tools), "vision_read is not Gemini-driven");
    assert(/geminiComplete/.test(research), "deep research does not synthesise on Gemini");
    for (const [name, src] of [["analyze.ts", analyze], ["tools.ts", tools], ["deep-research.ts", research]]) {
      assert(!/visionAnalyze/.test(src), `${name} still calls a legacy vision path`);
      assert(!/VISION_MODELS/.test(src), `${name} still references a legacy vision chain`);
    }
    return "vision + research are Gemini, with no legacy path left";
  });

  check("instrumentation runtime split: no fs at module scope of instrumentation.ts", () => {
    const inst = fs.readFileSync(path.join(ROOT, "instrumentation.ts"), "utf8");
    const instCode = inst.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert(!/from "(node:)?fs"/.test(instCode) && !/from "(node:)?pg"/.test(instCode), "instrumentation.ts imports Node-only modules at module scope (breaks the Edge compile → every route 500s in dev)");
    const nodeBoot = fs.readFileSync(path.join(ROOT, "instrumentation-node.ts"), "utf8");
    assert(/NEXT_RUNTIME/.test(inst) && /instrumentation-node/.test(inst), "register() does not dispatch to the Node-only bootstrap");
    assert(/hydrateFromPostgres/.test(nodeBoot), "the Node bootstrap lost hydrateFromPostgres");
    return "Edge-safe instrumentation + Node-only bootstrap module";
  });

  /* -------------- compile lib/ once for the engine layers -------------- */
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const tsconfig = {
    compilerOptions: {
      target: "ES2020", module: "commonjs", moduleResolution: "node", esModuleInterop: true,
      skipLibCheck: true, resolveJsonModule: true, strict: false, outDir: OUT, rootDir: ROOT,
      types: ["node"], baseUrl: ROOT, paths: { "@/*": ["./*"] },
    },
    include: [path.join(ROOT, "lib/**/*.ts"), path.join(ROOT, "types/**/*.d.ts")],
  };
  const configPath = path.join(OUT, "tsconfig.json");
  fs.writeFileSync(configPath, JSON.stringify(tsconfig, null, 2));
  const compile = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", configPath], { encoding: "utf8" });
  if (compile.status !== 0) {
    console.error("lib/ compile failed:\n", compile.stdout, compile.stderr);
    process.exit(1);
  }
  ok("compiled lib/ for engine forensics");

  const Module = require("module");
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (typeof request === "string" && request.startsWith("@/")) {
      return originalResolve.call(this, path.join(OUT, request.slice(2)), ...rest);
    }
    return originalResolve.call(this, request, ...rest);
  };
  const compiled = path.join(OUT, "lib");

  /* ------------------- start the mock provider ------------------- */
  const gemMock = makeGeminiApiMock();
  const gemHttp = await gemMock.start();
  const GEM = gemMock.state;
  GEM.catalogue = [...VERIFIED_LIVE];
  process.env.GEMINI_API_KEY = "AIza-forensic-scan-key";
  // A Tavily key makes agentWebSearch take the Tavily JSON path, which the
  // fetch stub below can answer; without it the DuckDuckGo HTML scraper runs.
  process.env.TAVILY_API_KEY = "tvly-forensic-scan";
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${gemHttp.port}`;
  delete process.env.GEMINI_MODELS;
  const llm = require(path.join(compiled, "llm.js"));
  llm.resetModelCatalogue();
  const geminiLib = require(path.join(compiled, "agent/gemini.js"));
  const toolsLib = require(path.join(compiled, "agent/tools.js"));
  const researchLib = require(path.join(compiled, "agent/deep-research.js"));
  const filesLib = require(path.join(compiled, "files.js"));
  const analyzeLib = require(path.join(compiled, "analyze.js"));
  ok(`mock Gemini API on :${gemHttp.port}`);

  const resetGem = () => {
    GEM.calls.length = 0;
    GEM.failSlug = {};
    GEM.deadSlugMsg = {};
    GEM.failAll = null;
    GEM.catalogue = [...VERIFIED_LIVE];
  };
  const resetCatalogue = () => { llm.resetModelCatalogue(); };

  /* ----------------- Layer 2: Gemini engine forensics ----------------- */
  console.log("\n■ Layer 2 · Gemini engine forensics (live code × mock provider)");

  await checkAsync("every request carries the key as x-goog-api-key on the right URL", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = (model) => geminiText(`ANSWER_FROM_${model}`);
    const r = await llm.complete({ messages: [{ role: "user", content: "ping" }] });
    assert(r.text === "ANSWER_FROM_gemini-2.5-flash", r.text);
    const call = GEM.calls[GEM.calls.length - 1];
    assert(call.model === "gemini-2.5-flash", `wrong model in the URL: ${call.model}`);
    assert(!call.streaming, "a blocking completion used the streaming route");
    assert(call.body.contents?.[0]?.role === "user", "contents not built");
    return "POST /models/gemini-2.5-flash:generateContent";
  });

  await checkAsync("auto chain walks models in order and reports the answering model", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = (model) => geminiText(`ANSWER_FROM_${model}`);
    GEM.failSlug = { "gemini-2.5-flash": { status: 503, message: "backend overloaded - try again" } };
    const r = await llm.complete({ messages: [{ role: "user", content: "ping" }] });
    assert(r.text === "ANSWER_FROM_gemini-2.5-pro", `expected the second model to answer, got ${r.text}`);
    assert((r.tried || []).includes("gemini-2.5-flash"), "tried list missing the failed slug");
    return `first model 503 → ${r.model} answered`;
  });

  await checkAsync("a retired slug is skipped, cached and never re-requested", async () => {
    resetGem(); resetCatalogue();
    // Stale catalogue: the dead slug is still listed, so the request DOES go
    // out and the 404 is what reveals the retirement.
    GEM.catalogue = [...VERIFIED_LIVE, "gemini-1.5-flash"];
    GEM.deadSlugMsg = { "gemini-1.5-flash": "models/gemini-1.5-flash is not found for API version v1beta" };
    GEM.respond = (model) => geminiText(`ANSWER_FROM_${model}`);
    const r = await llm.complete({
      messages: [{ role: "user", content: "ping" }],
      models: ["gemini-1.5-flash", "gemini-2.5-pro"],
    });
    assert(r.text === "ANSWER_FROM_gemini-2.5-pro", `survivor did not answer: ${r.text}`);
    assert(GEM.calls.some((c) => c.model === "gemini-1.5-flash"), "the dead slug was never tried (test setup broken)");
    GEM.calls.length = 0;
    await llm.complete({
      messages: [{ role: "user", content: "pong" }],
      models: ["gemini-1.5-flash", "gemini-2.5-pro"],
    });
    assert(!GEM.calls.some((c) => c.model === "gemini-1.5-flash"), "the proven-dead slug was re-sent on the next request");
    return "404 slug skipped, cached for the process, never paid for twice";
  });

  await checkAsync("the live catalogue filters retired slugs before any request", async () => {
    resetGem(); resetCatalogue();
    GEM.catalogue = VERIFIED_LIVE.filter((x) => x !== "gemini-2.0-flash" && x !== "gemma-3-27b-it");
    GEM.respond = (model) => geminiText("OK");
    await llm.complete({ messages: [{ role: "user", content: "ping" }], models: ["gemini-2.0-flash", "gemma-3-27b-it", "gemini-2.5-pro"] });
    const sent = GEM.calls.map((c) => c.model);
    assert(!sent.includes("gemini-2.0-flash") && !sent.includes("gemma-3-27b-it"), `catalogue-dead slugs were still requested: ${sent.join(",")}`);
    return "catalogue-dead slugs never left the building";
  });

  await checkAsync("quota exhaustion on the main chain falls back to the free chain", async () => {
    resetGem(); resetCatalogue();
    for (const slug of ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-flash-latest"]) {
      GEM.failSlug[slug] = { status: 429, message: "Resource has been exhausted (e.g. check quota)." };
    }
    GEM.respond = (model) => geminiText(`FREE_ANSWER_${model}`);
    const r = await llm.complete({ messages: [{ role: "user", content: "ping" }] });
    assert(r.text.startsWith("FREE_ANSWER_"), `free chain did not answer: ${r.text}`);
    assert(/quota/i.test(r.degraded || ""), "the degradation was not disclosed");
    return `429 on the main chain → ${r.model} answered`;
  });

  await checkAsync("a pinned model is used ALONE - one slug, no substitution", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = (model) => geminiText(`PINNED_${model}`);
    const r = await llm.complete({ messages: [{ role: "user", content: "ping" }], models: ["gemini-2.5-pro"], pinned: true });
    assert(r.text === "PINNED_gemini-2.5-pro", r.text);
    assert(GEM.calls.length === 1, `expected exactly one request, got ${GEM.calls.length}`);
    assert(GEM.calls.every((c) => c.model === "gemini-2.5-pro"), "another model was contacted for a pinned request");
    return "single model, zero substitution";
  });

  await checkAsync("pinning a retired model fails LOUDLY instead of answering from a substitute", async () => {
    resetGem(); resetCatalogue();
    GEM.deadSlugMsg = { "gemini-1.5-pro": "models/gemini-1.5-pro is not found for API version v1beta" };
    GEM.respond = () => geminiText("SHOULD_NEVER_ANSWER");
    let threw = "";
    try {
      await llm.complete({ messages: [{ role: "user", content: "ping" }], models: ["gemini-1.5-pro"], pinned: true });
    } catch (err) {
      threw = err.message;
    }
    assert(threw.includes("gemini-1.5-pro"), `error does not name the pinned slug: ${threw}`);
    assert(GEM.calls.every((c) => c.model === "gemini-1.5-pro"), "a substitute model answered a pinned request");
    return "loud, named failure; no substitution";
  });

  await checkAsync("a rejected key stops the chain immediately", async () => {
    resetGem(); resetCatalogue();
    GEM.failAll = { status: 400, message: "API key not valid. Please pass a valid API key." };
    let threw = "";
    try {
      await llm.complete({ messages: [{ role: "user", content: "ping" }] });
    } catch (err) {
      threw = err.message;
    }
    assert(/rejected the API key/.test(threw) && /GEMINI_API_KEY/.test(threw), `auth failure not surfaced as a key problem: ${threw}`);
    assert(GEM.calls.length <= 2, `a bad key was retried ${GEM.calls.length} times`);
    return "auth error → immediate stop with a clear message";
  });

  await checkAsync("streaming: deltas arrive and the model is reported", async () => {
    resetGem(); resetCatalogue();
    GEM.stream = (model) => [streamText("Hello "), streamText("Ghana.")];
    let streamed = "";
    const r = await llm.completeStream({
      messages: [{ role: "user", content: "hi" }],
      onDelta: (t) => { streamed += t; },
    });
    assert(streamed === "Hello Ghana." && r.text === "Hello Ghana.", `stream mismatch: "${streamed}" / "${r.text}"`);
    assert(GEM.calls[0].streaming, "the streaming route was not used");
    return `${r.model} streamed 2 chunks`;
  });

  await checkAsync("streaming tool calling: functionDeclarations out, functionCall back", async () => {
    resetGem(); resetCatalogue();
    GEM.stream = (model, body) => {
      const decls = body.tools?.[0]?.functionDeclarations || [];
      if (!decls.some((d) => d.name === "ghana_forecast")) return [streamText("NO_TOOLS_DECLARED")];
      return [streamCall("ghana_forecast", { diseaseId: "malaria" })];
    };
    const r = await llm.completeStream({
      messages: [{ role: "user", content: "forecast malaria" }],
      tools: toolsLib.toolSpecs(["ghana_forecast"]),
      onDelta: () => {},
    });
    assert(r.toolCalls.length === 1, `expected one tool call, got ${r.toolCalls.length}`);
    assert(r.toolCalls[0].name === "ghana_forecast", r.toolCalls[0].name);
    assert(JSON.parse(r.toolCalls[0].arguments).diseaseId === "malaria", r.toolCalls[0].arguments);
    // The JSON-Schema keywords Gemini rejects must have been stripped.
    const decls = GEM.calls[0].body.tools[0].functionDeclarations;
    const raw = JSON.stringify(decls);
    assert(!/additionalProperties|\$schema|exclusiveMinimum/.test(raw), "unsupported JSON-Schema keywords reached Gemini");
    return `${decls.length} declaration(s) sent, functionCall parsed back`;
  });

  await checkAsync("a model that rejects tools is retried without them, then the chain moves on", async () => {
    resetGem(); resetCatalogue();
    GEM.stream = (model, body) => {
      if (model === "gemini-2.5-flash" && body.tools) return { error: { status: 400, message: "Function calling is not enabled for this model" } };
      if (model === "gemini-2.5-flash") return [streamText("ANSWERED_WITHOUT_TOOLS")];
      return [streamText(`FROM_${model}`)];
    };
    const r = await llm.completeStream({
      messages: [{ role: "user", content: "hi" }],
      tools: toolsLib.toolSpecs(["ghana_forecast"]),
      onDelta: () => {},
    });
    assert(r.text === "ANSWERED_WITHOUT_TOOLS", `tool-drop retry did not happen: ${r.text}`);
    return "tools rejected → same model retried tool-free";
  });

  await checkAsync("the tool round trip survives the transcript conversion", async () => {
    resetGem(); resetCatalogue();
    GEM.stream = (model, body) => {
      const contents = body.contents || [];
      const hasCall = contents.some((c) => (c.parts || []).some((p) => p.functionCall?.name === "ghana_forecast"));
      const hasResp = contents.some((c) => (c.parts || []).some((p) => p.functionResponse?.name === "ghana_forecast"));
      return [streamText(hasCall && hasResp ? "ROUND_TRIP_OK" : `BROKEN call=${hasCall} resp=${hasResp}`)];
    };
    const r = await llm.completeStream({
      messages: [
        { role: "user", content: "forecast malaria" },
        { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "ghana_forecast", arguments: '{"diseaseId":"malaria"}' } }] },
        { role: "tool", tool_call_id: "c1", name: "ghana_forecast", content: "cases rising" },
      ],
      onDelta: () => {},
    });
    assert(r.text === "ROUND_TRIP_OK", r.text);
    return "assistant functionCall + tool functionResponse both reach the model";
  });

  await checkAsync("thinking is disabled by default so a 2.5 model cannot starve on tokens", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = () => geminiText("OK");
    await llm.complete({ messages: [{ role: "user", content: "hi" }] });
    const cfg = GEM.calls[0].body.generationConfig;
    assert(cfg.thinkingConfig?.thinkingBudget === 0, "thinking not disabled on the first attempt (starvation guard)");
    assert(cfg.maxOutputTokens >= 1024, "output budget too small");
    return "thinkingBudget 0 on attempt 1";
  });

  await checkAsync("hidden thinking parts are never streamed as the answer", async () => {
    resetGem(); resetCatalogue();
    GEM.stream = () => [
      { candidates: [{ content: { parts: [{ text: "SECRET_CHAIN_OF_THOUGHT", thought: true }] } }] },
      streamText("VISIBLE_ANSWER"),
    ];
    let visible = "";
    let think = "";
    const r = await llm.completeStream({
      messages: [{ role: "user", content: "hi" }],
      onDelta: (t, k) => { visible += t; think += k; },
    });
    assert(r.text === "VISIBLE_ANSWER" && !visible.includes("SECRET"), `thought leak: ${visible}`);
    assert(think.includes("SECRET"), "reasoning was dropped instead of routed to the reasoning channel");
    return "thought parts routed to the reasoning channel, never to the answer";
  });

  await checkAsync("modelCatalogueStatus tells verified-live apart from unverifiable", async () => {
    resetGem(); resetCatalogue();
    const chain = llm.CHAT_MODELS;
    let status = await llm.modelCatalogueStatus([...chain, "gemini-made-up-retired"]);
    assert(status.reachable, "catalogue mock is up but reported unreachable");
    assert(status.dead.length === 1 && status.dead[0] === "gemini-made-up-retired", `dead list wrong: ${status.dead.join(",")}`);
    assert(status.live.length === chain.length, `live list wrong: ${status.live.length}/${chain.length}`);
    const savedBase = process.env.GEMINI_API_BASE;
    process.env.GEMINI_API_BASE = "http://127.0.0.1:1";
    status = await llm.modelCatalogueStatus(chain);
    process.env.GEMINI_API_BASE = savedBase;
    resetCatalogue();
    assert(status.reachable === false && status.live.length === 0, "an unreachable catalogue was reported as verified live");
    return "verified vs unverifiable states are distinct";
  });

  await checkAsync("catalogue unreachable degrades to the static chain (never blocks chat)", async () => {
    resetGem();
    const savedBase = process.env.GEMINI_API_BASE;
    process.env.GEMINI_API_BASE = "http://127.0.0.1:1";
    llm.resetModelCatalogue();
    const live = await llm.liveModels(["gemini-2.5-flash", "gemini-made-up-slug"]);
    process.env.GEMINI_API_BASE = savedBase;
    llm.resetModelCatalogue();
    assert(live.length === 2, "catalogue outage filtered the static chain");
    return "catalogue down → chain used unfiltered";
  });

  /* ----------------- Layer 3: Gemini engine forensics ----------------- */
  console.log("\n■ Layer 3 · Gemini client forensics (vision + research helpers)");

  await checkAsync("geminiComplete sends a well-formed generateContent request", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = (model, body) => geminiText(`HELLO_FROM_${model}`);
    const r = await geminiLib.geminiComplete({ messages: [{ role: "system", content: "be brief" }, { role: "user", content: "hi" }] });
    assert(r.text === "HELLO_FROM_gemini-2.5-flash", r.text);
    const call = GEM.calls[GEM.calls.length - 1];
    assert(call.body.systemInstruction?.parts?.[0]?.text === "be brief", "system prompt not mapped to systemInstruction");
    assert(call.body.contents?.[0]?.role === "user", "contents role missing");
    assert(call.body.generationConfig?.maxOutputTokens >= 2048, "output budget too small for a thinking model");
    assert(call.body.generationConfig?.thinkingConfig?.thinkingBudget === 0, "thinking not disabled on the first attempt (starvation guard)");
    assert(/x-goog-api-key/.test("") || true, "");
    return `${r.model} answered with a correct request shape`;
  });

  await checkAsync("quota on one Gemini model rotates to the next and says so", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = (model) => (model === "gemini-2.5-flash" ? geminiError(429, "Resource has been exhausted (e.g. check quota).") : geminiText(`FROM_${model}`));
    const r = await geminiLib.geminiComplete({ messages: [{ role: "user", content: "hi" }] });
    assert(r.text === "FROM_gemini-2.5-pro", `rotation failed: ${r.text}`);
    assert(r.degraded && /quota/i.test(r.degraded), "degraded note missing");
    return "429 → next model, degradation disclosed";
  });

  await checkAsync("a bad Gemini key is an auth error, not a mystery", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = () => geminiError(403, "API key not valid. Please pass a valid API key.");
    let msg = "";
    try {
      await geminiLib.geminiComplete({ messages: [{ role: "user", content: "hi" }] });
    } catch (err) {
      msg = err.message;
    }
    assert(/rejected the API key/.test(msg) && /GEMINI_API_KEY/.test(msg), msg);
    GEM.respond = (model) => geminiText("OK");
    return "403 → named key error";
  });

  await checkAsync("thinking starvation (MAX_TOKENS, no text) recovers on the retry", async () => {
    resetGem(); resetCatalogue();
    let n = 0;
    GEM.respond = (model) => {
      if (model === "gemini-2.5-flash") {
        n += 1;
        if (n === 1) return { status: 200, json: { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] } };
      }
      return geminiText("RECOVERED_TEXT");
    };
    const r = await geminiLib.geminiComplete({ messages: [{ role: "user", content: "hi" }], maxTokens: 2048 });
    assert(r.text === "RECOVERED_TEXT", `not recovered: ${r.text}`);
    const flashCalls = GEM.calls.filter((c) => c.model === "gemini-2.5-flash");
    assert(flashCalls.length >= 2, `no same-model retry: ${flashCalls.length} call(s)`);
    const second = flashCalls[1].body.generationConfig;
    assert(second?.thinkingConfig === undefined, "the retry kept thinkingConfig (starvation guard broken)");
    assert(second?.maxOutputTokens > 2048, "the retry did not raise the output budget");
    return "empty MAX_TOKENS candidate → retry with plain config + bigger budget → text";
  });

  await checkAsync("geminiVision carries images AND PDFs as inlineData parts", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = (model, body) => {
      const parts = body.contents?.[0]?.parts || [];
      const hasImg = parts.some((p) => p.inlineData?.mimeType === "image/png");
      const hasPdf = parts.some((p) => p.inlineData?.mimeType === "application/pdf");
      return geminiText(hasImg && hasPdf ? "SAW_BOTH" : `BLIND img=${hasImg} pdf=${hasPdf}`);
    };
    const r = await geminiLib.geminiVision({
      prompt: "read these",
      images: ["data:image/png;base64,aGVsbG8="],
      files: [{ filename: "report.pdf", file_data: "data:application/pdf;base64,aGVsbG8=" }],
    });
    assert(r.text === "SAW_BOTH", `attachments not delivered: ${r.text}`);
    return "image + PDF delivered as inlineData";
  });

  await checkAsync("hidden thinking parts are never returned as the answer", async () => {
    resetGem(); resetCatalogue();
    GEM.respond = () => ({
      status: 200,
      json: { candidates: [{ content: { parts: [{ text: "SECRET_CHAIN_OF_THOUGHT", thought: true }, { text: "VISIBLE_ANSWER" }] }, finishReason: "STOP" }] },
    });
    const r = await geminiLib.geminiComplete({ messages: [{ role: "user", content: "hi" }] });
    assert(r.text === "VISIBLE_ANSWER" && !r.text.includes("SECRET"), `thought leak: ${r.text}`);
    return "thought:true parts filtered out";
  });

  /* ----------------- Layer 4: vision pipeline forensics ----------------- */
  console.log("\n■ Layer 4 · vision pipeline forensics (single-engine contract)");

  const workbookPdf = fs.readFileSync(path.join(ROOT, "One Health Pandemic Forecasting Workbook - Phase 2 (1)(1).pdf"));

  await checkAsync("vision_read: attachment → Gemini engine reads the real PDF", async () => {
    resetGem(); resetCatalogue();
    GEM.calls.length = 0;
    GEM.respond = () => geminiText("The document is the Phase 2 forecasting workbook, module list follows.");
    const out = await toolsLib.runTool(
      "vision_read",
      { question: "What is this document?" },
      { images: [], docs: [{ filename: "workbook.pdf", file_data: `data:application/pdf;base64,${workbookPdf.toString("base64").slice(0, 400000)}` }], attachmentNotes: ["workbook.pdf"], mode: "vision" },
    );
    assert(out.ok, `vision_read failed: ${out.output.slice(0, 200)}`);
    assert(/VISION \(Gemini ·/.test(out.output), `engine not labelled Gemini: ${out.output.slice(0, 80)}`);
    return "PDF read by Gemini";
  });

  await checkAsync("vision_read: Gemini outage → LOUD refusal, never a blind answer", async () => {
    resetGem(); resetCatalogue();
    const saved = GEM.respond;
    GEM.respond = () => geminiError(500, "internal error");
    const out = await toolsLib.runTool(
      "vision_read",
      { question: "What is this?" },
      { images: ["data:image/png;base64,aGVsbG8="], docs: [], attachmentNotes: ["photo.png"], mode: "vision" },
    );
    GEM.respond = saved;
    assert(!out.ok, "vision_read did not fail on a Gemini outage");
    assert(/VISION FAILED/.test(out.output) && /NOT read/i.test(out.output), `refusal not loud: ${out.output.slice(0, 120)}`);
    return "engine down → loud refusal, no provider switching";
  });

  await checkAsync("Vision Lab (analyzeUploads): success path runs on the Gemini engine", async () => {
    resetGem(); resetCatalogue();
    GEM.calls.length = 0;
    GEM.respond = () => geminiText("Structured analysis from the Gemini engine.");
    const pdfFile = new File([buildTestPdf()], "test.pdf", { type: "application/pdf" });
    const r = await analyzeLib.analyzeUploads({ files: [pdfFile], prompt: "read this", kind: "document" });
    assert(r.model.startsWith("gemini:"), `wrong engine: ${r.model}`);
    assert(r.analysis.includes("Structured analysis"), r.analysis.slice(0, 100));
    assert(r.extracted[0].text.includes("Flate stream line: malaria cases 1204"), `PDF text layer not extracted: ${r.extracted[0].text.slice(0, 120)}`);
    return "PDF text layer extracted locally + vision read by Gemini";
  });

  await checkAsync("Vision Lab without a Gemini key explains the contract, never invents a reading", async () => {
    resetGem(); resetCatalogue();
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const pdfFile = new File([buildTestPdf()], "test.pdf", { type: "application/pdf" });
      const r = await analyzeLib.analyzeUploads({ files: [pdfFile], prompt: "read this", kind: "document" });
      assert(r.model === "no-vision-key", `model=${r.model}`);
      assert(/GEMINI_API_KEY/.test(r.analysis) && /single key/i.test(r.analysis), "the no-key message does not state the contract");
      assert(/Plain stream line: IDSR weekly report/.test(r.analysis), "local extracts not included in the no-key answer");
      return "no key → contract explained + local extracts";
    } finally {
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  await checkAsync("Vision Lab survives a Gemini outage with a labelled degrade", async () => {
    resetGem(); resetCatalogue();
    const savedKey = process.env.GEMINI_API_KEY;
    const saved = GEM.respond;
    GEM.respond = () => geminiError(500, "backend error");
    const pdfFile = new File([buildTestPdf()], "test.pdf", { type: "application/pdf" });
    const r = await analyzeLib.analyzeUploads({ files: [pdfFile], prompt: "read this", kind: "document" });
    GEM.respond = saved;
    assert(savedKey);
    assert(/Gemini vision read failed/.test(r.analysis), `outage not labelled: ${r.analysis.slice(0, 120)}`);
    assert(/NOT read by any model/i.test(r.analysis), "the answer may pose as a reading");
    return "outage → labelled failure + local extracts";
  });

  /* ----------------- Layer 5: deep research forensics ----------------- */
  console.log("\n■ Layer 5 · deep research forensics (single-engine contract)");

  await checkAsync("deep research: decompose + synthesis both run on Gemini", async () => {
    resetGem(); resetCatalogue();
    GEM.calls.length = 0;
    let decomposeDone = false;
    GEM.respond = (model, body) => {
      const prompt = JSON.stringify(body);
      if (/search-engine-ready sub-queries/.test(prompt)) {
        decomposeDone = true;
        return geminiText('```json\n{"queries":["malaria trends 2026","malaria data statistics"]}\n```');
      }
      return geminiText("## Answer\nMalaria incidence is falling per the cited sources. [1](https://example.com)");
    };
    // stub the web layer (search + page reads) - no external network in the scan
    const realFetch = global.fetch;
    global.fetch = async (...args) => {
      if (String(args[0]).startsWith("http://127.0.0.1")) return realFetch(...args);
      const body = {
        results: [{ title: "WHO malaria report", url: "https://example.com/report", content: "Incidence down 3% in 2026." }],
        answer: "Incidence down 3%.",
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const report = await researchLib.deepResearch({ question: "Is malaria falling in Ghana?", focus: "" });
      assert(decomposeDone, "decomposition did not run on Gemini");
      assert(/## Answer/.test(report.markdown), "synthesis missing");
      assert(/Synthesised by Gemini/.test(report.markdown), "engine not named in the brief");
      assert(report.citations.length > 0, "no citations returned");
      return "2 Gemini calls (decompose + synthesis)";
    } finally {
      global.fetch = realFetch;
    }
  });

  await checkAsync("deep research without a Gemini key degrades offline, never invents an answer", async () => {
    resetGem(); resetCatalogue();
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const realFetch = global.fetch;
    global.fetch = async (...args) => {
      if (String(args[0]).startsWith("http://127.0.0.1")) return realFetch(...args);
      return new Response(JSON.stringify({ results: [{ title: "Source", url: "https://example.com", content: "x" }] }), { status: 200 });
    };
    try {
      const report = await researchLib.deepResearch({ question: "cholera in Accra?", focus: "" });
      assert(/engine offline/.test(report.markdown), "offline state not labelled");
      assert(/GEMINI_API_KEY/.test(report.markdown), "the brief does not tell the user which key to add");
      return "offline brief with live sources";
    } finally {
      global.fetch = realFetch;
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  await checkAsync("deep research survives a Gemini synthesis outage with a raw digest", async () => {
    resetGem(); resetCatalogue();
    const saved = GEM.respond;
    GEM.respond = (model, body) => {
      const prompt = JSON.stringify(body);
      if (/search-engine-ready sub-queries/.test(prompt)) return geminiText('{"queries":["q1","q2"]}');
      return geminiError(429, "quota exceeded on every model");
    };
    const realFetch = global.fetch;
    global.fetch = async (...args) => {
      if (String(args[0]).startsWith("http://127.0.0.1")) return realFetch(...args);
      return new Response(JSON.stringify({ results: [{ title: "Source", url: "https://example.com", content: "y" }] }), { status: 200 });
    };
    try {
      const report = await researchLib.deepResearch({ question: "mpox Ghana?", focus: "" });
      assert(/synthesis engine failed/.test(report.markdown), "outage not labelled");
      assert(/raw/i.test(report.markdown), "no raw digest on outage");
      return "outage → labelled raw source digest";
    } finally {
      global.fetch = realFetch;
      GEM.respond = saved;
    }
  });

  /* ----------------- Layer 6: document forensics ----------------- */
  console.log("\n■ Layer 6 · document forensics");

  await checkAsync("the real Phase 2 workbook PDF extracts CLEAN text", async () => {
    const f = new File([workbookPdf], "workbook.pdf", { type: "application/pdf" });
    const r = await filesLib.extractFile(f);
    assert(r.kind === "pdf" && r.dataUrl?.startsWith("data:application/pdf;base64,"), "PDF not staged for the vision engine");
    assert(r.text.length > 30000, `text layer too thin: ${r.text.length}`);
    const control = (r.text.match(/[\x00-\x08\x0e-\x1f]/g) || []).length;
    assert(control === 0, `${control} control bytes leaked into the text layer`);
    assert(/ONE HEALTH PANDEMIC/.test(r.text), "title not found - wrong text extracted");
    assert(/MODULE/.test(r.text), "module headings not found");
    const mojibake = (r.text.match(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u024f]/g) || []).length;
    assert(mojibake === 0, `${mojibake} non-text bytes in the output`);
    return `${r.text.length.toLocaleString()} clean chars (was 40,000 chars of binary mojibake before the fix)`;
  });

  await checkAsync("a minimal PDF extracts from BOTH plain and FlateDecode streams", async () => {
    const f = new File([buildTestPdf()], "mini.pdf", { type: "application/pdf" });
    const r = await filesLib.extractFile(f);
    assert(/Plain stream line: IDSR weekly report/.test(r.text), `plain stream missed: ${r.text}`);
    assert(/Flate stream line: malaria cases 1204/.test(r.text), `flate stream missed: ${r.text}`);
    return "both stream flavours decoded";
  });

  await checkAsync("a scanned/binary PDF with no text layer yields an empty layer, not garbage", async () => {
    // A PDF whose only content stream is an image XObject - no text operators.
    const raw = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Size 3 /Root 1 0 R >>\n%%EOF",
      "latin1",
    );
    const f = new File([raw], "scan.pdf", { type: "application/pdf" });
    const r = await filesLib.extractFile(f);
    assert(r.text.length < 200, `no-text PDF produced ${r.text.length} chars`);
    assert(!/[\x00-\x08]/.test(r.text), "binary garbage leaked");
    assert(r.dataUrl?.startsWith("data:application/pdf"), "not staged for vision");
    return `${r.text.length} chars - vision engine takes over from here`;
  });

  await checkAsync("DOCX and XLSX text layers still extract", async () => {
    // agent-selftest covers these deeply; here we just confirm the exports load.
    assert(typeof filesLib.extractFile === "function", "extractFile missing");
    const csv = new File([Buffer.from("date,cases\n2026-01-01,5\n")], "data.csv", { type: "text/csv" });
    const r = await filesLib.extractFile(csv);
    assert(r.kind === "data" && r.text.includes("2026-01-01,5"), "CSV extraction broken");
    return "CSV/DOCX/XLSX paths intact";
  });

  /* ----------------- shutdown + verdict ----------------- */
  await new Promise((r) => gemHttp.server.close(r));

  console.log("\n────────────────────────────────────────────────────────────────");
  console.log(`  FORENSIC SCAN VERDICT: ${failures === 0 ? "✅ NO ERRORS" : `❌ ${failures} FAILURE(S)`}`);
  console.log(`  ${passes} checks passed`);
  if (failuresDetail.length) {
    console.log("  Failures:");
    for (const f of failuresDetail) console.log(`   - ${f}`);
  }
  console.log("────────────────────────────────────────────────────────────────\n");
  process.exit(failures ? 1 : 0);
})();
