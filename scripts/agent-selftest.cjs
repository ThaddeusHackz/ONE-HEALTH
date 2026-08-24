/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Agent self-test.
 *
 * Compiles the real `lib/` tree with the project's own TypeScript compiler into
 * a throwaway directory, then drives the shipped modules directly - the same
 * `runTool` / `evaluateExpression` / memory / store code the API routes use.
 * Nothing here re-implements the logic under test.
 *
 *   node scripts/agent-selftest.cjs
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".next", "agent-selftest");

let failures = 0;
function check(name, fn) {
  try {
    const detail = fn();
    console.log("PASS", name, detail ? `- ${detail}` : "");
  } catch (err) {
    failures += 1;
    console.error("FAIL", name, "-", err.message);
  }
}
async function checkAsync(name, fn) {
  try {
    const detail = await fn();
    console.log("PASS", name, detail ? `- ${detail}` : "");
  } catch (err) {
    failures += 1;
    console.error("FAIL", name, "-", err.message);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const tsconfig = {
    compilerOptions: {
      target: "ES2020",
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      strict: false,
      outDir: OUT,
      rootDir: ROOT,
      types: ["node"],
      baseUrl: ROOT,
      paths: { "@/*": ["./*"] },
    },
    include: [path.join(ROOT, "lib/**/*.ts"), path.join(ROOT, "types/**/*.d.ts")],
  };
  const configPath = path.join(OUT, "tsconfig.json");
  fs.writeFileSync(configPath, JSON.stringify(tsconfig, null, 2));

  const compile = spawnSync(
    process.execPath,
    [path.join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", configPath],
    { encoding: "utf8" },
  );
  if (compile.status !== 0) {
    console.error("TypeScript compile failed:\n", compile.stdout, compile.stderr);
    process.exit(1);
  }
  console.log("compiled lib/ ->", path.relative(ROOT, OUT));

  // Resolve "@/..." exactly as Next does, but into the compiled tree so we
  // execute the same source the API routes ship.
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (typeof request === "string" && request.startsWith("@/")) {
      return originalResolve.call(this, path.join(OUT, request.slice(2)), ...rest);
    }
    return originalResolve.call(this, request, ...rest);
  };

  const compiled = path.join(OUT, "lib");
  const { evaluateExpression } = require(path.join(compiled, "agent/compute.js"));
  const tools = require(path.join(compiled, "agent/tools.js"));
  const memory = require(path.join(compiled, "agent/memory.js"));
  const { getDB } = require(path.join(compiled, "store.js"));
  const openrouter = require(path.join(compiled, "openrouter.js"));

  const ctx = { images: [], docs: [], attachmentNotes: [], mode: "chat" };
  const call = (name, args) => tools.runTool(name, args, ctx);

  /* ------------------------------ compute ------------------------------ */
  check("compute: arithmetic with precedence", () => {
    const r = evaluateExpression("(1540/7)*1.12 + sqrt(81)");
    assert(r.ok, r.error);
    assert(Math.abs(Number(r.value) - (220 * 1.12 + 9)) < 1e-9, `got ${r.value}`);
    return r.value;
  });
  check("compute: stats over arrays", () => {
    const r = evaluateExpression("mean([12,15,9,22])");
    assert(r.ok && Number(r.value) === 14.5, r.error || r.value);
    const s = evaluateExpression("stdev([2,4,4,4,5,5,7,9])");
    assert(Math.abs(Number(s.value) - 2.138089935299395) < 1e-9, s.value);
    return `mean=${r.value} stdev=${Number(s.value).toFixed(4)}`;
  });
  check("compute: rejects nonsense safely (no eval)", () => {
    const bad = evaluateExpression("process.exit(1)");
    assert(bad.ok === false, "should refuse identifiers");
    const div = evaluateExpression("1/0");
    assert(div.ok === false, "should refuse non-finite");
    return `${bad.error} | ${div.error}`;
  });

  /* ------------------------------- tools ------------------------------- */
  check("tools: registry exposes the full capability surface", () => {
    const names = tools.TOOLS.map((t) => t.name);
    for (const required of [
      "web_search",
      "web_fetch",
      "image_search",
      "image_generate",
      "vision_read",
      "create_file",
      "list_files",
      "read_file",
      "delete_file",
      "sandbox_exec",
      "chart",
      "table",
      "compute",
      "ghana_forecast",
      "ghana_national_table",
      "weather_now",
      "deep_research",
      "memory_save",
      "memory_recall",
      "plan",
      "ask_user",
      "current_time",
    ]) {
      assert(names.includes(required), `missing tool ${required}`);
    }
    const specs = tools.toolSpecs();
    assert(specs.every((s) => s.type === "function" && s.function.parameters), "bad tool schema");
    return `${names.length} tools, ${specs.length} schemas`;
  });

  check("tools: client-only tools pause the loop for the browser sandbox", () => {
    assert(tools.isClientTool("sandbox_exec"), "sandbox_exec must be client-side");
    assert(tools.isClientTool("ask_user"), "ask_user must be client-side");
    assert(!tools.isClientTool("web_search"), "web_search must run server-side");
    return "sandbox_exec, ask_user";
  });

  await checkAsync("tools: ghana_forecast runs the local ensemble", async () => {
    const out = await call("ghana_forecast", { disease: "malaria", region: "national", horizon: 4 });
    assert(out.ok, out.output);
    assert(/FORECAST Malaria/.test(out.output), "no forecast text");
    const chart = out.events.find((e) => e.type === "chart");
    assert(chart && chart.chart.x.length > 8, "no chart payload");
    assert(chart.chart.series[0].values.every((v) => Number.isFinite(v)), "non-finite series");
    return `${chart.chart.x.length} points`;
  });

  await checkAsync("tools: ghana_forecast rejects unknown disease", async () => {
    const out = await call("ghana_forecast", { disease: "not-a-disease" });
    assert(!out.ok && /Unknown disease/.test(out.output), out.output);
    return out.output.slice(0, 40);
  });

  await checkAsync("tools: national board renders a live table", async () => {
    const out = await call("ghana_national_table", {});
    assert(out.ok, out.output);
    const table = out.events.find((e) => e.type === "table");
    assert(table && table.table.rows.length >= 5, "table too thin");
    assert(table.table.columns.includes("Alert"), "missing alert column");
    return `${table.table.rows.length} signals`;
  });

  await checkAsync("tools: chart + table specs reach the UI layer", async () => {
    const chart = await call("chart", {
      title: "Cases",
      kind: "bar",
      x: ["W1", "W2", "W3"],
      series: [{ name: "cholera", values: [4, 9, 6] }],
    });
    assert(chart.ok && chart.events[0].type === "chart", chart.output);
    const table = await call("table", { title: "T", columns: ["a", "b"], rows: [["1", "2"]] });
    assert(table.ok && table.events[0].table.rows[0].a === "1", table.output);
    const bad = await call("chart", { title: "x", kind: "line", x: [], series: [] });
    assert(!bad.ok, "empty chart must fail");
    return "chart+table ok, empty rejected";
  });

  await checkAsync("tools: compute tool is deterministic", async () => {
    const out = await call("compute", { expression: "percentile([3,7,8,12,14],50)" });
    assert(out.ok && out.output.includes("8"), out.output);
    return out.output;
  });

  await checkAsync("tools: workspace file round-trip through the store", async () => {
    const name = `selftest-${Date.now()}.html`;
    const created = await call("create_file", { name, content: "<h1>hi</h1>" });
    assert(created.ok && created.events[0].type === "file", created.output);
    const read = await call("read_file", { name });
    assert(read.ok && read.output.includes("<h1>hi</h1>"), read.output);
    const listed = await call("list_files", {});
    assert(listed.output.includes(name), "file not listed");
    const gone = await call("delete_file", { name });
    assert(gone.ok, gone.output);
    const missing = await call("read_file", { name });
    assert(!missing.ok, "delete did not work");
    return "create → read → list → delete";
  });

  await checkAsync("tools: memory save and recall", async () => {
    const saved = await call("memory_save", { fact: "Self-test fact: Ashanti malaria lead", tag: "project" });
    assert(saved.ok && saved.events[0].type === "memory", saved.output);
    const recalled = await call("memory_recall", { query: "Ashanti malaria" });
    assert(recalled.ok && /Ashanti malaria lead/.test(recalled.output), recalled.output);
    const secret = await call("memory_save", { fact: "OPENROUTER_API_KEY=sk-or-v1-secret" });
    assert(!secret.ok, "must refuse to store secrets");
    return "recall hit, secret refused";
  });

  await checkAsync("tools: plan and current_time", async () => {
    const plan = await call("plan", { steps: ["search", "analyse", "report"] });
    assert(plan.ok && plan.events[0].steps.length === 3, plan.output);
    const now = await call("current_time", {});
    assert(now.ok && /Africa\/Accra/.test(now.output), now.output);
    return now.output.slice(0, 60);
  });

  await checkAsync("tools: image_generate fails cleanly without a Gemini key", async () => {
    const out = await call("image_generate", { prompt: "a clinic in Kumasi" });
    assert(!out.ok, "should fail without a key");
    assert(/GEMINI_API_KEY/i.test(out.output), `should name Gemini: ${out.output}`);
    assert(!/openrouter/i.test(out.output), "must not mention OpenRouter");
    return out.output.slice(0, 74);
  });

  check("images: Gemini chain excludes the retired Imagen endpoints", () => {
    const media = require(path.join(compiled, "agent/media.js"));
    const chain = media.GEMINI_IMAGE_MODEL_CHAIN;
    assert(chain.length >= 3, "chain too short");
    assert(chain.every((m) => /^gemini-/.test(m)), `non-Gemini slug: ${chain.join(", ")}`);
    assert(!chain.some((m) => /imagen/i.test(m)), "Imagen shut down 2026-08-17 - must not be called");
    return chain.join(", ");
  });

  check("images: response parser handles camelCase and snake_case parts", () => {
    const media = require(path.join(compiled, "agent/media.js"));
    const camel = media.extractGeminiImage({
      candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } }] } }],
    });
    assert(camel && camel.b64 === "aGVsbG8=" && camel.mime === "image/png", JSON.stringify(camel));
    const snake = media.extractGeminiImage({
      candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/jpeg", data: "d29ybGQ=" } }] } }],
    });
    assert(snake && snake.b64 === "d29ybGQ=" && snake.mime === "image/jpeg", JSON.stringify(snake));
    const none = media.extractGeminiImage({ candidates: [{ content: { parts: [{ text: "refused" }] } }] });
    assert(none === null, "should report no image");
    const blocked = media.geminiFailure({ promptFeedback: { blockReason: "SAFETY" } }, 200);
    assert(/SAFETY/.test(blocked), blocked);
    return "inlineData + inline_data + blocked-prompt all parsed";
  });

  check("images: nothing in the codebase calls the OpenRouter image API", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|yaml|example)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (/openrouter\.ai\/api\/v1\/images/.test(text) || /OPENROUTER_IMAGE_MODELS/.test(text)) {
            offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(path.join(ROOT, "lib"));
    walk(path.join(ROOT, "app"));
    walk(path.join(ROOT, "components"));
    offenders.push(...[/OPENROUTER_IMAGE_MODELS/.test(fs.readFileSync(path.join(ROOT, "render.yaml"), "utf8")) ? "render.yaml" : ""]);
    offenders.push(...[/OPENROUTER_IMAGE_MODELS/.test(fs.readFileSync(path.join(ROOT, ".env.example"), "utf8")) ? ".env.example" : ""]);
    const real = offenders.filter(Boolean);
    assert(real.length === 0, `still referenced in: ${real.join(", ")}`);
    return "image generation is Gemini-only";
  });

  check("images: the Gemini key resolver refuses an OpenRouter key", () => {
    const envSrc = fs.readFileSync(path.join(ROOT, "lib/env.ts"), "utf8");
    assert(/GEMINI_API_KEY/.test(envSrc), "no GEMINI_API_KEY alias");
    assert(/sk-or-/.test(envSrc) && /geminiKey/.test(envSrc), "missing sk-or guard on geminiKey");
    return "aliases + sk-or guard present";
  });

  await checkAsync("tools: vision_read refuses to invent without attachments", async () => {
    const out = await call("vision_read", { question: "what is in the photo?" });
    assert(!out.ok && /No attachments/.test(out.output), out.output);
    return out.output.slice(0, 50);
  });

  await checkAsync("tools: web layer degrades instead of throwing", async () => {
    const out = await call("web_search", { query: "Ghana Health Service cholera" });
    assert(typeof out.output === "string", "no output");
    assert(!/undefined/.test(out.output), "leaked undefined");
    return out.output.split("\n")[0].slice(0, 70);
  });

  await checkAsync("tools: web_fetch blocks SSRF targets", async () => {
    const out = await call("web_fetch", { url: "http://169.254.169.254/latest/meta-data/" });
    assert(/Refused/.test(out.output), out.output);
    const local = await call("web_fetch", { url: "http://localhost:3000/api/health" });
    assert(/Refused/.test(local.output), local.output);
    return "metadata + loopback refused";
  });

  await checkAsync("tools: unknown tool is handled", async () => {
    const out = await call("not_a_tool", {});
    assert(!out.ok && /Unknown tool/.test(out.output), out.output);
    return out.output;
  });

  /* ------------------------------ memory ------------------------------- */
  check("memory: conversation persistence and listing", () => {
    const row = memory.upsertConversation({
      mode: "research",
      model: "test-model",
      messages: [
        { role: "user", content: "Self-test conversation about cholera in Accra" },
        { role: "assistant", content: "Answer", model: "test-model" },
      ],
    });
    assert(row.id, "no id");
    const listed = memory.listConversations();
    assert(listed.some((c) => c.id === row.id), "not listed");
    const loaded = memory.getConversation(row.id);
    assert(loaded && loaded.messages.length === 2, "bad reload");
    memory.deleteConversation(row.id);
    assert(!memory.getConversation(row.id), "delete failed");
    return `${listed.length} conversations visible`;
  });

  check("memory: workspace file store caps and metadata", () => {
    const f = memory.writeFile("selftest-meta.csv", "a,b\n1,2\n");
    assert(f.bytes > 0 && f.language === "csv", JSON.stringify(f));
    memory.deleteFile("selftest-meta.csv");
    return `${f.language} ${f.bytes}b`;
  });

  /* ------------------------------- store ------------------------------- */
  check("store: AI Agent tab sits between Home and Forecast", () => {
    const nav = getDB().nav.map((n) => n.href);
    assert(nav[0] === "/", `first is ${nav[0]}`);
    assert(nav[1] === "/agent", `second is ${nav[1]}`);
    assert(nav[2] === "/forecast", `third is ${nav[2]}`);
    return nav.slice(0, 3).join(" → ");
  });

  check("store: agent stores exist in the database shape", () => {
    const db = getDB();
    assert(Array.isArray(db.agentMemory), "agentMemory missing");
    assert(Array.isArray(db.agentConversations), "agentConversations missing");
    assert(Array.isArray(db.agentFiles), "agentFiles missing");
    return "agentMemory, agentConversations, agentFiles";
  });

  /* --------------------------- render hardening ------------------------ */
  check("render: oversized snapshot is trimmed, not refused", () => {
    const pgStore = require(path.join(compiled, "pg-store.js"));
    const big = {
      content: { brandName: "ONE HEALTH" },
      agentFiles: Array.from({ length: 40 }, (_, i) => ({
        id: `f${i}`,
        name: `f${i}.html`,
        content: "x".repeat(400_000),
        bytes: 400_000,
      })),
      agentConversations: Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        messages: Array.from({ length: 60 }, () => ({ role: "user", content: "y".repeat(6000) })),
      })),
    };
    const before = JSON.stringify(big).length;
    const { body, bytes, trimmed } = pgStore.trimSnapshot(big, 12_000_000);
    assert(bytes <= 12_000_000, `still ${bytes} bytes`);
    assert(bytes < before, "nothing was trimmed");
    assert(body.content?.brandName === "ONE HEALTH", "unrelated state was damaged");
    assert(body.agentFiles.length === 40, "file metadata must survive");
    assert(trimmed.length > 0, "no trim reported");
    return `${(before / 1e6).toFixed(1)}MB -> ${(bytes / 1e6).toFixed(1)}MB (${trimmed.join(", ")})`;
  });

  check("render: small snapshot passes through untouched", () => {
    const pgStore = require(path.join(compiled, "pg-store.js"));
    const small = { content: { brandName: "ONE HEALTH" }, agentFiles: [{ name: "a.md", content: "hi" }] };
    const { body, trimmed } = pgStore.trimSnapshot(small);
    assert(trimmed.length === 0, "should not trim");
    assert(body.agentFiles[0].content === "hi", "content changed");
    return "no trim";
  });

  check("render: agent store caps keep the snapshot row bounded", () => {
    const memory = require(path.join(compiled, "agent/memory.js"));
    const big = "z".repeat(500_000);
    const f = memory.writeFile("cap-check.html", big);
    assert(f.bytes <= 120_000, `file cap not applied: ${f.bytes}`);
    memory.deleteFile("cap-check.html");
    const row = memory.upsertConversation({
      messages: Array.from({ length: 400 }, (_, i) => ({ role: "user", content: `m${i} ` + "q".repeat(40_000) })),
    });
    const loaded = memory.getConversation(row.id);
    assert(loaded.messages.length <= 160, `message cap not applied: ${loaded.messages.length}`);
    assert(loaded.messages[0].content.length <= 12_000, "message content not capped");
    memory.deleteConversation(row.id);
    return `file<=${f.bytes}B, msgs=${loaded.messages.length}`;
  });

  check("render: shared pg pool is configured for a small connection budget", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/pg-pool.ts"), "utf8");
    assert(/max:\s*2/.test(src), "pool max not limited");
    assert(/connectionTimeoutMillis/.test(src), "no connection timeout");
    const store = fs.readFileSync(path.join(ROOT, "lib/store.ts"), "utf8");
    assert(/savePgSnapshot/.test(store), "store no longer snapshots");
    const archive = fs.readFileSync(path.join(ROOT, "lib/archive.ts"), "utf8");
    assert(!/new Client/.test(archive), "archive still opens a client per event");
    return "max:2, timeout set, no per-call clients";
  });

  check("render: SSE cannot be buffered by Next compression", () => {
    const cfg = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    assert(/compress:\s*false/.test(cfg), "compress not disabled");
    const route = fs.readFileSync(path.join(ROOT, "app/api/agent/route.ts"), "utf8");
    assert(/X-Accel-Buffering/.test(route), "missing anti-buffering header");
    assert(/text\/event-stream/.test(route), "missing SSE content type");
    return "compress:false + X-Accel-Buffering:no";
  });

  /* ----------------------------- openrouter ---------------------------- */
  check("openrouter: model chain is chunked at the 3-slug API limit", () => {
    assert(openrouter.MAX_MODELS_PER_REQUEST === 3, "limit changed");
    const groups = openrouter.fallbackGroups();
    assert(groups.every((g) => g.length <= 3), "a group exceeds 3 slugs");
    assert(groups.length > 3, `only ${groups.length} groups`);
    return `${groups.length} groups covering ${groups.flat().length} models`;
  });

  check("openrouter: streaming + tool-calling entrypoint is exported", () => {
    assert(typeof openrouter.completeStream === "function", "completeStream missing");
    const spec = { type: "function", function: { name: "x", description: "d", parameters: {} } };
    assert(spec.type === "function");
    return "completeStream";
  });

  console.log(failures ? `\n${failures} AGENT SELF-TEST(S) FAILED` : "\nALL AGENT SELF-TESTS PASSED");
  process.exit(failures ? 1 : 0);
})();
