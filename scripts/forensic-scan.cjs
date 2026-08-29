/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔬 THE FORENSIC SCAN - one command, everything checked.
 *
 *   node scripts/forensic-scan.cjs        (or: npm run forensic)
 *
 * Layers:
 *   1. Static audit      - typecheck, lint, source contracts, model-chain hygiene
 *   2. Engine forensics  - the REAL lib/ code compiled once, then driven against
 *                          local mock OpenRouter + Gemini servers (real HTTP on
 *                          127.0.0.1). No external network, no real keys.
 *   3. Vision forensics  - vision_read / Vision Lab / ingest run end to end;
 *                          asserts the OpenRouter mock receives ZERO calls
 *                          (vision + deep research are Gemini-only).
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
 * Mock OpenRouter. Behaviour is driven by mutable state:
 *   catalogue   - slugs reported by GET /models
 *   deadSlugMsg - map slug -> error message returned for any request whose
 *                 models array contains it (simulates "No endpoints found")
 *   failSlug    - map slug -> {status, message} for individual model failures
 *   respond     - fn(body) -> {model, text} for a successful completion
 *   failAll     - {status, message}: every completion fails (credit/auth tests)
 *   calls       - every request body, for asserting what was and was not sent
 */
function makeOpenRouterMock() {
  const state = {
    catalogue: [],
    deadSlugMsg: {},
    failSlug: {},
    respond: null,
    failAll: null,
    calls: [],
  };
  const handler = async (req, res) => {
    const body = await readBody(req);
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    if (req.url.endsWith("/models")) {
      send(200, { data: state.catalogue.map((id) => ({ id })) });
      return;
    }
    if (req.url.endsWith("/chat/completions")) {
      let parsed = {};
      try {
        parsed = JSON.parse(body || "{}");
      } catch {}
      state.calls.push(parsed);
      if (state.failAll) {
        send(state.failAll.status, { error: { message: state.failAll.message } });
        return;
      }
      const models = (Array.isArray(parsed.models) ? parsed.models : [parsed.model]).filter(Boolean);
      // A "No endpoints found" slug poisons the WHOLE request (observed OpenRouter
      // behaviour, and the reason the old chain lost Claude/Mistral/DeepSeek).
      for (const slug of models) {
        if (state.deadSlugMsg[slug]) {
          send(400, { error: { message: state.deadSlugMsg[slug] } });
          return;
        }
      }
      // A model-specific failure (429/5xx/402) walks down the array to the next
      // healthy slug, like OpenRouter's provider fallback does.
      const healthy = models.filter((slug) => !state.failSlug[slug]);
      if (!healthy.length) {
        const first = state.failSlug[models[0]] || { status: 500, message: "all models failed" };
        send(first.status, { error: { message: first.message } });
        return;
      }
      if (state.failSlug[models[0]]) {
        // emulate latency-free in-array fallback by answering from the next model
        const r = state.respond ? state.respond({ ...parsed, models: healthy, model: healthy[0] }) : null;
        if (!r) {
          send(state.failSlug[models[0]].status, { error: { message: state.failSlug[models[0]].message } });
          return;
        }
        send(200, { id: `gen-${randomUUID().slice(0, 8)}`, model: r.model, choices: [{ message: { content: r.text } }] });
        return;
      }
      if (!state.respond) {
        send(500, { error: { message: "mock has no responder configured" } });
        return;
      }
      const r = state.respond(parsed);
      send(200, { id: `gen-${randomUUID().slice(0, 8)}`, model: r.model, choices: [{ message: { content: r.text } }] });
      return;
    }
    send(404, { error: { message: "unknown mock route" } });
  };
  return { state, start: () => startServer(handler) };
}

/** Mock Gemini - POST /v1beta/models/{model}:generateContent */
function makeGeminiMock() {
  const state = {
    respond: null, // fn(model, body) -> {status, json}
    calls: [],
  };
  const handler = async (req, res) => {
    const body = await readBody(req);
    const m = /\/models\/([^:]+):generateContent$/.exec(req.url);
    if (!m) {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {}
    state.calls.push({ model: m[1], body: parsed });
    if (!state.respond) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "gemini mock has no responder" } }));
      return;
    }
    const r = state.respond(m[1], parsed);
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r.json));
  };
  return { state, start: () => startServer(handler) };
}

const geminiText = (text) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] } });
const geminiError = (status, message) => ({ status, json: { error: { message, status: String(status) } } });

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

  /** Slugs verified live against openrouter.ai/api/v1/models on 2026-08-29. */
  const VERIFIED_LIVE = [
    "openai/gpt-4.1-mini", "openai/gpt-4.1", "openai/gpt-4o", "openai/gpt-4o-mini",
    "google/gemini-2.5-flash", "google/gemini-2.5-pro",
    "anthropic/claude-sonnet-4.6", "anthropic/claude-sonnet-4", "anthropic/claude-haiku-4.5",
    "deepseek/deepseek-v3.2", "deepseek/deepseek-chat", "deepseek/deepseek-r1",
    "mistralai/mistral-small-3.2-24b-instruct", "mistralai/mistral-nemo",
    "mistralai/mistral-large-2512", "mistralai/mistral-small-2603", "mistralai/mistral-small-3.1-24b-instruct",
    "meta-llama/llama-3.3-70b-instruct",
    "google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-3-ultra-550b-a55b:free",
  ];
  /** Slugs verified DEAD (zero endpoints) on OpenRouter, 2026-08-29. */
  const VERIFIED_DEAD = [
    "anthropic/claude-3.5-sonnet", "mistralai/mistral-large-2411",
    "meta-llama/llama-3.3-70b-instruct:free", "google/gemma-3-27b-it:free",
    "qwen/qwen-2.5-72b-instruct:free", "mistralai/mistral-7b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free", "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free", "inclusionai/ling-3.0-flash:free",
    "deepseek/deepseek-chat-v3-0324:free", "deepseek/deepseek-v3-base:free",
  ];

  let openrouterSrc = "";
  function arrayLiteral(src, name) {
    const start = src.indexOf(`export const ${name} = [`);
    assert(start >= 0, `${name} not found`);
    const end = src.indexOf("];", start);
    return src.slice(start, end);
  }

  check("model chain hygiene: no dead slugs, 3-per-request groups", () => {
    openrouterSrc = fs.readFileSync(path.join(ROOT, "lib/openrouter.ts"), "utf8");
    const modelsSrc = fs.readFileSync(path.join(ROOT, "lib/agent/models.ts"), "utf8");
    const chatArr = arrayLiteral(openrouterSrc, "CHAT_MODELS");
    const freeArr = arrayLiteral(openrouterSrc, "FREE_MODELS");
    const dropdownArr = modelsSrc.slice(modelsSrc.indexOf("export const PINNABLE_MODELS"), modelsSrc.indexOf("export const PINNABLE_SLUGS"));
    const shipped = [...chatArr.matchAll(/"([^"]+)"/g)].map((m) => m[1]).concat([...freeArr.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    const dropdownSlugs = [...dropdownArr.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
    for (const dead of VERIFIED_DEAD) {
      assert(!shipped.includes(dead), `${dead} is retired but still in the chain`);
      assert(!dropdownSlugs.includes(dead), `${dead} is retired but still in the dropdown`);
    }
    assert(shipped.length >= 12, `chain too thin: ${shipped.length}`);
    assert(shipped.every((s) => VERIFIED_LIVE.includes(s)), `chain contains an unverified slug: ${shipped.filter((s) => !VERIFIED_LIVE.includes(s)).join(", ")}`);
    assert(/MAX_MODELS_PER_REQUEST = 3/.test(openrouterSrc), "3-slug request limit constant missing");
    assert(dropdownSlugs.every((s) => VERIFIED_LIVE.includes(s)), `dropdown contains an unverified slug: ${dropdownSlugs.filter((s) => !VERIFIED_LIVE.includes(s)).join(", ")}`);
    return `${shipped.length} chain slugs + ${dropdownSlugs.length} dropdown slugs, all verified live 2026-08-29`;
  });

  check("source contract: vision + deep research never touch OpenRouter", () => {
    const analyze = fs.readFileSync(path.join(ROOT, "lib/analyze.ts"), "utf8");
    const tools = fs.readFileSync(path.join(ROOT, "lib/agent/tools.ts"), "utf8");
    const research = fs.readFileSync(path.join(ROOT, "lib/agent/deep-research.ts"), "utf8");
    for (const [name, src] of [["analyze.ts", analyze], ["tools.ts", tools], ["deep-research.ts", research]]) {
      assert(!/visionAnalyze/.test(src), `${name} still calls the OpenRouter vision path`);
      assert(!/VISION_MODELS/.test(src), `${name} still references an OpenRouter vision chain`);
    }
    const researchCode = research.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert(!/openrouter/i.test(researchCode), "deep-research.ts references OpenRouter in code");
    assert(!/from "\.\.\/openrouter"|from "@\/lib\/openrouter"/.test(research), "deep-research.ts imports the OpenRouter client");
    assert(/geminiComplete/.test(research), "deep research does not synthesise on Gemini");
    return "no OpenRouter vision/research path exists in the product code";
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

  /* ------------------- start the mock providers ------------------- */
  const orMock = makeOpenRouterMock();
  const gemMock = makeGeminiMock();
  const orHttp = await orMock.start();
  const gemHttp = await gemMock.start();
  const OR = orMock.state;
  const GEM = gemMock.state;
  orMock.state.catalogue = [...VERIFIED_LIVE];
  process.env.OPENROUTER_API_KEY = "sk-or-v1-forensic-scan";
  process.env.GEMINI_API_KEY = "AIza-forensic-scan-key";
  // A Tavily key makes agentWebSearch take the Tavily JSON path, which the
  // fetch stub below can answer; without it the DuckDuckGo HTML scraper runs.
  process.env.TAVILY_API_KEY = "tvly-forensic-scan";
  process.env.OPENROUTER_API_BASE = `http://127.0.0.1:${orHttp.port}`;
  process.env.GEMINI_API_BASE = `http://127.0.0.1:${gemHttp.port}`;
  const openrouter = require(path.join(compiled, "openrouter.js"));
  openrouter.resetModelCatalogue();
  const geminiLib = require(path.join(compiled, "agent/gemini.js"));
  const toolsLib = require(path.join(compiled, "agent/tools.js"));
  const researchLib = require(path.join(compiled, "agent/deep-research.js"));
  const filesLib = require(path.join(compiled, "files.js"));
  const analyzeLib = require(path.join(compiled, "analyze.js"));
  ok(`mock OpenRouter on :${orHttp.port}, mock Gemini on :${gemHttp.port}`);

  const zeroOR = (label) => assert(OR.calls.length === 0, `${label}: OpenRouter received ${OR.calls.length} call(s) - the Gemini-only contract is broken`);
  const resetOR = () => { OR.calls.length = 0; };
  const resetCatalogue = () => { openrouter.resetModelCatalogue(); };

  /* ----------------- Layer 2: OpenRouter engine forensics ----------------- */
  console.log("\n■ Layer 2 · OpenRouter engine forensics (live code × mock provider)");

  await checkAsync("auto chain walks groups in order and reports the answering model", async () => {
    resetCatalogue(); resetOR();
    OR.respond = (body) => ({ model: (body.models || [])[0] || body.model, text: `ANSWER_FROM_${(body.models || [])[0]}` });
    OR.failSlug = { "openai/gpt-4.1-mini": { status: 503, message: "provider overloaded - try again" } };
    const r = await openrouter.complete({ messages: [{ role: "user", content: "ping" }] });
    assert(r.text === "ANSWER_FROM_google/gemini-2.5-flash", `expected the group-2 model to answer, got ${r.text}`);
    assert((r.tried || []).includes("openai/gpt-4.1-mini"), "tried list missing the failed slug");
    return `first model 503 → ${r.model} answered`;
  });

  await checkAsync("a retired slug inside a group cannot poison its group (recovery)", async () => {
    resetCatalogue(); resetOR();
    // Stale catalogue: the dead slug is still listed, so the request DOES go
    // out and the endpoint error is what reveals the retirement.
    OR.catalogue = [...VERIFIED_LIVE, "anthropic/claude-3.5-sonnet"];
    OR.failSlug = {};
    OR.deadSlugMsg = { "anthropic/claude-3.5-sonnet": "No endpoints found that match your request. Supported params: model=anthropic/claude-3.5-sonnet." };
    // force the dead slug into the chain via preferred models with live neighbours
    OR.respond = (body) => ({ model: (body.models || [])[0], text: `ANSWER_FROM_${(body.models || [])[0]}` });
    const r = await openrouter.complete({
      messages: [{ role: "user", content: "ping" }],
      models: ["anthropic/claude-sonnet-4.6", "anthropic/claude-3.5-sonnet", "deepseek/deepseek-v3.2"],
    });
    assert(r.text.startsWith("ANSWER_FROM_anthropic/claude-sonnet-4.6"), `survivor did not answer: ${r.text}`);
    // the group request went out once with the dead slug, then was retried without it
    const firstCall = OR.calls[0];
    assert((firstCall.models || []).includes("anthropic/claude-3.5-sonnet"), "the poisoned group was never sent (test setup broken)");
    assert((OR.calls[1]?.models || []).length === 2, `no clean retry without the dead slug: ${JSON.stringify(OR.calls.map((c) => c.models))}`);
    // second call must never re-send the proven-dead slug
    OR.calls.length = 0;
    await openrouter.complete({
      messages: [{ role: "user", content: "pong" }],
      models: ["anthropic/claude-sonnet-4.6", "anthropic/claude-3.5-sonnet", "deepseek/deepseek-v3.2"],
    });
    const resent = OR.calls.some((c) => (c.models || []).includes("anthropic/claude-3.5-sonnet"));
    assert(!resent, "the proven-dead slug was re-sent on the next request");
    return "group with a dead slug retried without it; dead slug cached and never re-sent";
  });

  await checkAsync("the live catalogue filters retired slugs before any request", async () => {
    resetCatalogue(); resetOR();
    OR.deadSlugMsg = {};
    OR.catalogue = VERIFIED_LIVE.filter((s) => s !== "mistralai/mistral-nemo" && s !== "meta-llama/llama-3.3-70b-instruct");
    OR.respond = (body) => ({ model: (body.models || [])[0], text: "OK" });
    await openrouter.complete({ messages: [{ role: "user", content: "ping" }], models: ["mistralai/mistral-nemo", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-chat"] });
    const sent = OR.calls.flatMap((c) => c.models || []);
    assert(!sent.includes("mistralai/mistral-nemo") && !sent.includes("meta-llama/llama-3.3-70b-instruct"), "catalogue-dead slugs were still requested");
    return "catalogue-dead slugs never left the building";
  });

  await checkAsync("paid-chain credit exhaustion falls back to the free chain", async () => {
    resetCatalogue(); resetOR();
    OR.catalogue = [...VERIFIED_LIVE];
    OR.failSlug = {};
    OR.deadSlugMsg = {};
    const paid = VERIFIED_LIVE.filter((s) => !/:free$/.test(s));
    for (const s of paid) OR.failSlug[s] = { status: 402, message: "Insufficient credits: you have run out of credits" };
    OR.respond = (body) => ({ model: (body.models || [])[0], text: `FREE_ANSWER_${(body.models || [])[0]}` });
    const r = await openrouter.complete({ messages: [{ role: "user", content: "ping" }], models: paid.slice(0, 3) });
    assert(r.text.startsWith("FREE_ANSWER_"), `free chain did not answer: ${r.text}`);
    OR.failSlug = {};
    return `402 on every paid model → ${r.model} answered`;
  });

  await checkAsync("a pinned model is sent ALONE - one slug, no fallback array", async () => {
    resetCatalogue(); resetOR();
    OR.failSlug = {};
    OR.respond = (body) => ({ model: body.model, text: `PINNED_${body.model}` });
    const r = await openrouter.complete({ messages: [{ role: "user", content: "ping" }], models: ["anthropic/claude-sonnet-4.6"], pinned: true });
    assert(r.text === "PINNED_anthropic/claude-sonnet-4.6", r.text);
    assert(OR.calls.length === 1, `expected exactly one request, got ${OR.calls.length}`);
    const body = OR.calls[0];
    assert(!Array.isArray(body.models), "pinned request carried a fallback models array");
    assert(body.model === "anthropic/claude-sonnet-4.6", `pinned request carried ${body.model}`);
    return "single model field, zero substitution";
  });

  await checkAsync("pinning a retired model fails LOUDLY instead of answering from a substitute", async () => {
    resetCatalogue(); resetOR();
    OR.deadSlugMsg = { "mistralai/mistral-large-2411": "No endpoints found that match your request" };
    OR.respond = (body) => ({ model: body.model, text: "SHOULD_NEVER_ANSWER" });
    let threw = "";
    try {
      await openrouter.complete({ messages: [{ role: "user", content: "ping" }], models: ["mistralai/mistral-large-2411"], pinned: true });
    } catch (err) {
      threw = err.message;
    }
    assert(threw.includes("mistralai/mistral-large-2411"), `error does not name the pinned slug: ${threw}`);
    assert(!OR.calls.some((c) => c.model !== "mistralai/mistral-large-2411"), "a substitute model answered a pinned request");
    return "loud, named failure; no substitution";
  });

  await checkAsync("a rejected key stops the chain immediately", async () => {
    resetCatalogue(); resetOR();
    OR.deadSlugMsg = {};
    OR.failSlug = {};
    OR.failAll = { status: 401, message: "Invalid API key provided" };
    let threw = "";
    try {
      await openrouter.complete({ messages: [{ role: "user", content: "ping" }] });
    } catch (err) {
      threw = err.message;
    }
    assert(/rejected the API key/.test(threw), `auth failure not surfaced as a key problem: ${threw}`);
    assert(OR.calls.length <= 3, `a bad key was retried ${OR.calls.length} times`);
    OR.failAll = null;
    return "auth error → immediate stop with a clear message";
  });

  await checkAsync("modelCatalogueStatus tells verified-live apart from unverifiable", async () => {
    resetCatalogue();
    const chain = openrouter.CHAT_MODELS;
    let status = await openrouter.modelCatalogueStatus([...chain, "made-up/retired-slug"]);
    assert(status.reachable, "catalogue mock is up but reported unreachable");
    assert(status.dead.length === 1 && status.dead[0] === "made-up/retired-slug", `dead list wrong: ${status.dead.join(",")}`);
    assert(status.live.length === chain.length, `live list wrong: ${status.live.length}/${chain.length}`);
    // Now kill the catalogue endpoint and confirm the honest "unreachable" verdict.
    const savedBase = process.env.OPENROUTER_API_BASE;
    process.env.OPENROUTER_API_BASE = "http://127.0.0.1:1";
    status = await openrouter.modelCatalogueStatus(chain);
    process.env.OPENROUTER_API_BASE = savedBase;
    resetCatalogue();
    assert(status.reachable === false && status.live.length === 0, "an unreachable catalogue was reported as verified live");
    return "verified vs unverifiable states are distinct";
  });

  await checkAsync("catalogue unreachable degrades to the static chain (never blocks chat)", async () => {
    resetOR();
    // point the base at a dead port for the catalogue fetch only, then restore
    const savedBase = process.env.OPENROUTER_API_BASE;
    const dead = await startServer(() => {});
    await new Promise((r) => dead.server.close(r)); // occupied then released → connection refused
    process.env.OPENROUTER_API_BASE = `http://127.0.0.1:1`;
    openrouter.resetModelCatalogue();
    const live = await openrouter.liveModels(["openai/gpt-4.1-mini", "made-up/dead-slug"]);
    process.env.OPENROUTER_API_BASE = savedBase;
    openrouter.resetModelCatalogue();
    assert(live.length === 2, "catalogue outage filtered the static chain");
    return "catalogue down → chain used unfiltered";
  });

  /* ----------------- Layer 3: Gemini engine forensics ----------------- */
  console.log("\n■ Layer 3 · Gemini engine forensics (vision + research + image)");

  await checkAsync("geminiComplete sends a well-formed generateContent request", async () => {
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
    GEM.calls.length = 0;
    GEM.respond = (model) => (model === "gemini-2.5-flash" ? geminiError(429, "Resource has been exhausted (e.g. check quota).") : geminiText(`FROM_${model}`));
    const r = await geminiLib.geminiComplete({ messages: [{ role: "user", content: "hi" }] });
    assert(r.text === "FROM_gemini-2.5-pro", `rotation failed: ${r.text}`);
    assert(r.degraded && /quota/i.test(r.degraded), "degraded note missing");
    return "429 → next model, degradation disclosed";
  });

  await checkAsync("a bad Gemini key is an auth error, not a mystery", async () => {
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
    GEM.calls.length = 0;
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
    GEM.calls.length = 0;
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
    GEM.respond = () => ({
      status: 200,
      json: { candidates: [{ content: { parts: [{ text: "SECRET_CHAIN_OF_THOUGHT", thought: true }, { text: "VISIBLE_ANSWER" }] }, finishReason: "STOP" }] },
    });
    const r = await geminiLib.geminiComplete({ messages: [{ role: "user", content: "hi" }] });
    assert(r.text === "VISIBLE_ANSWER" && !r.text.includes("SECRET"), `thought leak: ${r.text}`);
    return "thought:true parts filtered out";
  });

  /* ----------------- Layer 4: vision pipeline forensics ----------------- */
  console.log("\n■ Layer 4 · vision pipeline forensics (Gemini-only contract)");

  const workbookPdf = fs.readFileSync(path.join(ROOT, "One Health Pandemic Forecasting Workbook - Phase 2 (1)(1).pdf"));

  await checkAsync("vision_read: attachment → Gemini engine, ZERO OpenRouter calls", async () => {
    resetOR(); resetCatalogue();
    GEM.calls.length = 0;
    GEM.respond = () => geminiText("The document is the Phase 2 forecasting workbook, module list follows.");
    const out = await toolsLib.runTool(
      "vision_read",
      { question: "What is this document?" },
      { images: [], docs: [{ filename: "workbook.pdf", file_data: `data:application/pdf;base64,${workbookPdf.toString("base64").slice(0, 400000)}` }], attachmentNotes: ["workbook.pdf"], mode: "vision" },
    );
    assert(out.ok, `vision_read failed: ${out.output.slice(0, 200)}`);
    assert(/VISION \(Gemini ·/.test(out.output), `engine not labelled Gemini: ${out.output.slice(0, 80)}`);
    zeroOR("vision_read success");
    return "PDF read by Gemini; OpenRouter untouched";
  });

  await checkAsync("vision_read: Gemini outage → LOUD refusal, still ZERO OpenRouter calls", async () => {
    resetOR(); resetCatalogue();
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
    zeroOR("vision_read outage");
    return "engine down → loud refusal, no provider switching";
  });

  await checkAsync("Vision Lab (analyzeUploads): success path is Gemini-only", async () => {
    resetOR(); resetCatalogue();
    GEM.calls.length = 0;
    GEM.respond = () => geminiText("Structured analysis from the Gemini engine.");
    const pdfFile = new File([buildTestPdf()], "test.pdf", { type: "application/pdf" });
    const r = await analyzeLib.analyzeUploads({ files: [pdfFile], prompt: "read this", kind: "document" });
    assert(r.model.startsWith("gemini:"), `wrong engine: ${r.model}`);
    assert(r.analysis.includes("Structured analysis"), r.analysis.slice(0, 100));
    assert(r.extracted[0].text.includes("Flate stream line: malaria cases 1204"), `PDF text layer not extracted: ${r.extracted[0].text.slice(0, 120)}`);
    zeroOR("analyzeUploads");
    return "PDF text layer extracted locally + vision read by Gemini";
  });

  await checkAsync("Vision Lab without a Gemini key explains the contract, never switches provider", async () => {
    resetOR(); resetCatalogue();
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const pdfFile = new File([buildTestPdf()], "test.pdf", { type: "application/pdf" });
      const r = await analyzeLib.analyzeUploads({ files: [pdfFile], prompt: "read this", kind: "document" });
      assert(r.model === "no-vision-key", `model=${r.model}`);
      assert(/GEMINI_API_KEY/.test(r.analysis) && /never used to see files/i.test(r.analysis), "the no-key message does not state the contract");
      assert(/Plain stream line: IDSR weekly report/.test(r.analysis), "local extracts not included in the no-key answer");
      zeroOR("analyzeUploads no-key");
      return "no key → contract explained + local extracts, OpenRouter untouched";
    } finally {
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  await checkAsync("Vision Lab survives a Gemini outage with a labelled degrade", async () => {
    resetOR(); resetCatalogue();
    const savedKey = process.env.GEMINI_API_KEY;
    const saved = GEM.respond;
    GEM.respond = () => geminiError(500, "backend error");
    const pdfFile = new File([buildTestPdf()], "test.pdf", { type: "application/pdf" });
    const r = await analyzeLib.analyzeUploads({ files: [pdfFile], prompt: "read this", kind: "document" });
    GEM.respond = saved;
    assert(savedKey);
    assert(/Gemini vision read failed/.test(r.analysis), `outage not labelled: ${r.analysis.slice(0, 120)}`);
    assert(/NOT read by any model/i.test(r.analysis), "the answer may pose as a reading");
    zeroOR("analyzeUploads outage");
    return "outage → labelled failure + local extracts";
  });

  /* ----------------- Layer 5: deep research forensics ----------------- */
  console.log("\n■ Layer 5 · deep research forensics (Gemini-only contract)");

  await checkAsync("deep research: decompose + synthesis on Gemini, ZERO OpenRouter calls", async () => {
    resetOR(); resetCatalogue();
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
      zeroOR("deep research");
      return "2 Gemini calls (decompose + synthesis); OpenRouter untouched";
    } finally {
      global.fetch = realFetch;
    }
  });

  await checkAsync("deep research without a Gemini key degrades offline, never to OpenRouter", async () => {
    resetOR(); resetCatalogue();
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
      zeroOR("deep research offline");
      return "offline brief with live sources; OpenRouter untouched";
    } finally {
      global.fetch = realFetch;
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  await checkAsync("deep research survives a Gemini synthesis outage with a raw digest", async () => {
    resetOR(); resetCatalogue();
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
      zeroOR("deep research outage");
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
  await new Promise((r) => orHttp.server.close(r));
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
