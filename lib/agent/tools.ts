import { GHANA_CONTEXT, DISEASES, REGIONS } from "@/lib/ghana";
import { nationalSnapshot, runForecast } from "@/lib/forecast";
import { ghanaWeather } from "@/lib/weather";
import { visionAnalyze, type ToolCallSpec } from "@/lib/openrouter";
import { redactText } from "@/lib/redact";
import { recordAudit } from "@/lib/store";
import { agentWebSearch, fetchPageText, formatAgentHits } from "./web";
import { generateImage, unsplashSearch } from "./media";
import { deepResearch } from "./deep-research";
import { evaluateExpression } from "./compute";
import {
  deleteFile,

  listFiles,
  readFile,
  recallFacts,
  saveFact,
  writeFile,
} from "./memory";
import type { AgentEvent, ChartSpec, TableSpec } from "./types";

export interface ToolContext {
  images: string[];
  docs: { filename: string; file_data: string }[];
  attachmentNotes: string[];
  mode: string;
}

export interface ToolOutcome {
  /** What the model reads back. */
  output: string;
  ok: boolean;
  /** Rich payloads the UI renders (never sent back into the prompt verbatim). */
  events: AgentEvent[];
  /** Client-executed tool: pause the loop and hand the call to the browser. */
  client?: { name: string; payload: Record<string, unknown> };
}

type Args = Record<string, unknown>;

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Executed in the browser sandbox instead of on the server. */
  clientOnly?: boolean;
  run?: (args: Args, ctx: ToolContext) => Promise<ToolOutcome>;
}

function ok(output: string, events: AgentEvent[] = []): ToolOutcome {
  return { output, ok: true, events };
}

function fail(output: string): ToolOutcome {
  return { output, ok: false, events: [] };
}

const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "web_search",
    description:
      "Search the live internet for current information, news and sources. Returns titles, URLs, snippets and an answer summary. Use for anything after the training cutoff, news, prices, outbreaks, guidelines.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: { type: "number", description: "1-10 results, default 6" },
        topic: { type: "string", enum: ["general", "news"], description: "news for breaking stories" },
        days: { type: "number", description: "Restrict to the last N days" },
        include_domains: { type: "array", items: { type: "string" }, description: "Only these domains" },
      },
      required: ["query"],
    },
    async run(args) {
      const query = String(args.query || "").trim();
      if (!query) return fail("query is required");
      const result = await agentWebSearch({
        query,
        maxResults: num(args.max_results, 6),
        topic: args.topic === "news" ? "news" : "general",
        days: args.days ? Number(args.days) : undefined,
        includeDomains: Array.isArray(args.include_domains) ? args.include_domains : undefined,
        includeImages: true,
      });
      const citations = result.hits.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet }));
      const events: AgentEvent[] = [];
      if (citations.length) events.push({ type: "citations", citations });
      if (result.images.length) events.push({ type: "stock", images: result.images, engine: result.engine });
      events.push({ type: "status", text: `Web: ${result.hits.length} results via ${result.engine}` });
      return ok(
        `Live web results for "${query}" (engine: ${result.engine})\n${
          result.answer ? `ANSWER: ${result.answer}\n\n` : ""
        }${formatAgentHits(result.hits)}\n\nCite the URLs you rely on.`,
        events,
      );
    },
  },

  {
    name: "web_fetch",
    description: "Fetch and read the text of one specific web page or JSON endpoint. Use after web_search to read a promising source in full.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        max_chars: { type: "number", description: "Default 6000, max 20000" },
      },
      required: ["url"],
    },
    async run(args) {
      const max = Math.min(num(args.max_chars, 6000), 20000);
      const page = await fetchPageText(String(args.url || ""), max);
      const red = redactText(page.text);
      return ok(
        `PAGE: ${page.title}\nURL: ${page.url}\n\n${red.text || "(no readable text extracted)"}`,
        [{ type: "citations", citations: [{ title: page.title || page.url, url: page.url }] }],
      );
    },
  },

  {
    name: "image_search",
    description: "Find real stock photographs (Unsplash) to illustrate a page, report or slide. Returns creditable image URLs. Not for generated art - use image_generate for that.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        count: { type: "number", description: "1-12, default 6" },
      },
      required: ["query"],
    },
    async run(args) {
      const query = String(args.query || "").trim();
      const { images, engine } = await unsplashSearch(query, num(args.count, 6));
      if (!images.length) return fail(`No stock images found for "${query}" (engine: ${engine}).`);
      return ok(
        `Stock photographs for "${query}" (engine ${engine}):\n${images
          .map((i, n) => `${n + 1}. ${i.alt} - ${i.url} (credit: ${i.author} ${i.link})`)
          .join("\n")}`,
        [{ type: "stock", images, engine }],
      );
    },
  },

  {
    name: "image_generate",
    description:
      "Generate a brand new AI image from a text description (illustrations, posters, mockups, infographics) using the Gemini image models. Returns a base64 image. Never use real patient photos as input.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed visual description" },
        aspect_ratio: { type: "string", description: "e.g. 1:1, 16:9, 4:3, 3:4" },
        model: { type: "string", description: "Optional Gemini image model override, e.g. gemini-2.5-flash-image" },
      },
      required: ["prompt"],
    },
    async run(args) {
      try {
        const image = await generateImage({
          prompt: String(args.prompt || ""),
          aspectRatio: args.aspect_ratio ? String(args.aspect_ratio) : undefined,
          model: args.model ? String(args.model) : undefined,
        });
        recordAudit({ actor: "agent", action: "image_generate", model: image.model, redactions: 0, detail: String(args.prompt).slice(0, 80) });
        return ok(
          `Generated an image with ${image.model} on the Gemini API (${Math.round(image.bytes / 1024)} KB${
            image.note ? `, ${image.note}` : ""
          }). It is rendered in the conversation. Describe it briefly; do not repeat base64.`,
          [{ type: "image", image: { dataUrl: image.dataUrl, prompt: image.prompt, model: image.model } }],
        );
      } catch (err) {
        return fail(`Image generation failed: ${(err as Error).message}`);
      }
    },
  },

  {
    name: "vision_read",
    description:
      "Read and analyse files the user attached: photos, screenshots, PDFs, Word, Excel, CSV. Extracts text, tables, Ghana health fields, and flags identifiers. Use whenever the user attaches something.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "What to extract or verify in the attachment(s)" },
      },
      required: ["question"],
    },
    async run(args, ctx) {
      if (!ctx.images.length && !ctx.docs.length) {
        return fail("No attachments in this turn. Ask the user to attach the file or photo.");
      }
      const result = await visionAnalyze({
        prompt: String(args.question || "Describe exactly what this document or image contains."),
        images: ctx.images,
        files: ctx.docs,
        extraSystem:
          "You are the vision tool of ONE HEALTH GHANA. Extract only what is visible. Flag possible identifiers without repeating them.",
      });
      recordAudit({ actor: "agent", action: "vision", model: result.model, redactions: 0, detail: String(args.question).slice(0, 80) });
      return ok(
        `VISION (${result.model}):\n${result.text}`,
        [{ type: "status", text: `Vision read via ${result.model}` }],
      );
    },
  },

  {
    name: "create_file",
    description:
      "Write a file into the user's workspace: HTML pages, JS/TS, Python, Markdown, CSV, JSON, SVG, reports. The file appears in the Workspace panel and can be previewed, run in the sandbox or downloaded.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filename with extension, e.g. report.md, dashboard.html" },
        content: { type: "string", description: "Full file content" },
        language: { type: "string", description: "Optional language override" },
      },
      required: ["name", "content"],
    },
    async run(args) {
      const file = writeFile(
        String(args.name || "file.txt"),
        String(args.content || ""),
        typeof args.language === "string" ? args.language : undefined,
      );
      recordAudit({ actor: "agent", action: "create_file", redactions: 0, detail: file.name });
      return ok(
        `Wrote ${file.name} (${file.bytes} bytes, ${file.language}) into the workspace.`,
        [{ type: "file", file }],
      );
    },
  },

  {
    name: "list_files",
    description: "List every file currently in the user's workspace.",
    parameters: { type: "object", properties: {} },
    async run() {
      const files = listFiles();
      if (!files.length) return ok("The workspace is empty.");
      return ok(
        files.map((f) => `- ${f.name} (${f.language}, ${f.bytes} bytes, updated ${f.updatedAt})`).join("\n"),
      );
    },
  },

  {
    name: "read_file",
    description: "Read the content of a workspace file.",
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    async run(args) {
      const file = readFile(String(args.name || ""));
      if (!file) return fail(`No workspace file named ${args.name}. Use list_files.`);
      return ok(`--- ${file.name} (${file.language}) ---\n${file.content.slice(0, 20000)}`);
    },
  },

  {
    name: "delete_file",
    description: "Delete a workspace file.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    async run(args) {
      const name = String(args.name || "");
      if (!readFile(name)) return fail(`No workspace file named ${name}.`);
      deleteFile(name);
      return ok(`Deleted ${name}.`);
    },
  },

  {
    name: "sandbox_exec",
    description:
      "Run code in the isolated in-browser sandbox and get stdout, the return value and any error back. Languages: javascript (Node-ish browser JS with fetch to same origin), html (rendered live in the preview pane), python (Pyodide, first run downloads the runtime), css, svg, json. Use it to verify calculations, test code you wrote, or build a live preview.",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["javascript", "html", "python", "css", "svg", "json"] },
        code: { type: "string" },
        filename: { type: "string", description: "Optional: also save this into the workspace" },
      },
      required: ["language", "code"],
    },
    clientOnly: true,
  },

  {
    name: "chart",
    description:
      "Render a live interactive chart in the conversation (Recharts). Data you pass is plotted exactly as given - never invent numbers.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: ["line", "area", "bar", "pie", "scatter", "composed"] },
        x: { type: "array", items: { type: "string" }, description: "Category / axis labels" },
        series: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, values: { type: "array", items: { type: "number" } } },
          },
        },
        unit: { type: "string" },
        note: { type: "string" },
      },
      required: ["title", "kind", "x", "series"],
    },
    async run(args) {
      const spec: ChartSpec = {
        title: String(args.title || "Chart"),
        kind: (["line", "area", "bar", "pie", "scatter", "composed"].includes(String(args.kind)) ? String(args.kind) : "line") as ChartSpec["kind"],
        x: (Array.isArray(args.x) ? args.x : []).map(String),
        series: (Array.isArray(args.series) ? args.series : []).map((s: Args) => ({
          name: String(s?.name || "series"),
          values: (Array.isArray(s?.values) ? s.values : []).map((v: unknown) => Number(v) || 0),
        })),
        unit: args.unit ? String(args.unit) : undefined,
        note: args.note ? String(args.note) : undefined,
      };
      if (!spec.x.length || !spec.series.length) return fail("chart needs non-empty x labels and series");
      return ok(
        `Rendered a ${spec.kind} chart "${spec.title}" with ${spec.series.length} series over ${spec.x.length} points.`,
        [{ type: "chart", chart: spec }],
      );
    },
  },

  {
    name: "table",
    description: "Render a formatted data table in the conversation. Use for comparisons, rankings and structured results.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: "string" } } },
        note: { type: "string" },
      },
      required: ["columns", "rows"],
    },
    async run(args) {
      const columns = (Array.isArray(args.columns) ? args.columns : []).map(String);
      const rows = (Array.isArray(args.rows) ? args.rows : []).map((r: unknown[], i: number) => {
        const out: Record<string, string | number> = {};
        columns.forEach((c, j) => (out[c] = String((r as unknown[])[j] ?? "")));
        return { "#": i + 1, ...out };
      });
      const spec: TableSpec = {
        title: String(args.title || "Table"),
        columns: ["#", ...columns],
        rows,
        note: args.note ? String(args.note) : undefined,
      };
      if (!rows.length) return fail("table needs at least one row");
      return ok(`Rendered table "${spec.title}" (${rows.length} rows).`, [{ type: "table", table: spec }]);
    },
  },

  {
    name: "compute",
    description:
      "Evaluate arithmetic and statistics deterministically without a sandbox: expressions with + - * / % ^, sqrt, pow, log, ln, exp, sin, cos, tan, abs, round, min, max, mean, median, stdev, percentile. Prefer this over mental maths.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "e.g. mean([12,15,9,22]) or (1540/7)*1.12 + sqrt(81)" },
      },
      required: ["expression"],
    },
    async run(args) {
      const res = evaluateExpression(String(args.expression || ""));
      return res.ok ? ok(`${args.expression} = ${res.value}`) : fail(`Cannot evaluate: ${res.error}`);
    },
  },

  {
    name: "ghana_forecast",
    description:
      "Run the local probabilistic ensemble forecast for a Ghana disease/region (naive, seasonal naive, Holt, ridge, leakage-safe random forest) and return the interval, z-score, CUSUM and narrative. Local statistics - no API key needed.",
    parameters: {
      type: "object",
      properties: {
        disease: { type: "string", description: `One of: ${DISEASES.map((d) => d.id).join(", ")}` },
        region: { type: "string", description: `One of: national, ${REGIONS.map((r) => r.id).join(", ")}` },
        horizon: { type: "number", description: "Weeks ahead, 1-12, default 4" },
      },
      required: ["disease"],
    },
    async run(args) {
      const diseaseId = String(args.disease || "malaria");
      const regionId = String(args.region || "national");
      if (!DISEASES.some((d) => d.id === diseaseId)) {
        return fail(`Unknown disease "${diseaseId}". Valid: ${DISEASES.map((d) => d.id).join(", ")}`);
      }
      const bundle = runForecast({ diseaseId, regionId, horizon: num(args.horizon, 4) });
      const series = [...bundle.series.slice(-8), ...bundle.ensemble.points.map((p) => ({ date: p.date, week: 0, cases: p.point, imputed: false }))];
      const chart: ChartSpec = {
        title: `${bundle.disease.name} - ${bundle.region.name}`,
        kind: "composed",
        x: series.map((p) => p.date),
        series: [{ name: "cases", values: series.map((p) => p.cases) }],
        unit: bundle.disease.unit,
        note: bundle.disclaimer,
      };
      return ok(
        `FORECAST ${bundle.disease.name} / ${bundle.region.name}\n` +
          `Latest week ${bundle.series[bundle.series.length - 1]?.date}: ${bundle.diagnostics.latest} (z=${bundle.diagnostics.latestZ.toFixed(2)}, CUSUM=${bundle.diagnostics.latestCusum.toFixed(2)})\n` +
          `Next week ensemble: ${bundle.ensemble.points[0]?.point} [${bundle.ensemble.points[0]?.low} - ${bundle.ensemble.points[0]?.high}]\n` +
          `Nowcast: ${bundle.narrative.nowcast}\nOutlook: ${bundle.narrative.outlook}\nOne Health: ${bundle.narrative.oneHealth}\n` +
          `Limits: ${bundle.narrative.limits}\nSource: ${bundle.diagnostics.source}`,
        [{ type: "chart", chart }, { type: "status", text: `Ensemble: ${bundle.models.length} models` }],
      );
    },
  },

  {
    name: "ghana_national_table",
    description: "Live national table across every tracked Ghana signal: latest count, z-score, next-week point and interval, alert flag.",
    parameters: { type: "object", properties: {} },
    async run() {
      const rows = nationalSnapshot();
      const spec: TableSpec = {
        title: "Ghana national signal board",
        columns: ["#", "Signal", "Pillar", "Latest", "z", "Next week", "Interval", "Alert"],
        rows: rows.map((r, i) => ({
          "#": i + 1,
          Signal: r.name,
          Pillar: r.pillar,
          Latest: r.latest,
          z: Number(r.z.toFixed(2)),
          "Next week": Math.round(r.nextWeek),
          Interval: `${Math.round(r.low)}-${Math.round(r.high)}`,
          Alert: r.alert ? "WATCH" : "-",
        })),
        note: "Model output with intervals, not confirmed counts.",
      };
      return ok(
        `National board:\n${rows.map((r) => `${r.name}: ${r.latest} (z=${r.z.toFixed(2)}) next ${Math.round(r.nextWeek)}`).join("\n")}`,
        [{ type: "table", table: spec }],
      );
    },
  },

  {
    name: "weather_now",
    description: "Current weather across Ghana cities (OpenWeather) for the environmental One Health pillar: rain, heat, humidity next to cholera and malaria watches.",
    parameters: { type: "object", properties: {} },
    async run() {
      const w = await ghanaWeather();
      return ok(
        `${w.note}\n${w.rows
          .map((r) => `${r.region} (${r.city}): ${r.temp}°C, feels ${r.feels}°C, humidity ${r.humidity}%, rain1h ${r.rain1h}mm, ${r.description}`)
          .join("\n")}`,
        [{ type: "status", text: `Weather: ${w.note}` }],
      );
    },
  },

  {
    name: "deep_research",
    description:
      "Run a multi-step sourced investigation: decomposes the question into sub-queries, searches the live web for each, reads the best sources, and returns a structured report with inline citations. Use for 'research', 'review the literature', 'compare', 'brief me on'.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        focus: { type: "string", description: "Optional angle, e.g. 'Ghana only', 'cost-effectiveness'" },
      },
      required: ["question"],
    },
    async run(args) {
      const report = await deepResearch({
        question: String(args.question || ""),
        focus: args.focus ? String(args.focus) : "",
      });
      return ok(
        report.markdown,
        [
          { type: "citations", citations: report.citations },
          { type: "status", text: `Deep research: ${report.queries.length} queries, ${report.citations.length} sources` },
        ],
      );
    },
  },

  {
    name: "memory_save",
    description: "Remember a durable fact for future sessions: a preference, a project, a correction, a Ghana health detail. Never store secrets or patient identifiers.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string" },
        tag: { type: "string", description: "preference | project | domain | health | general" },
      },
      required: ["fact"],
    },
    async run(args) {
      const text = String(args.fact || "").trim();
      if (/api[_ -]?key|password|token|secret/i.test(text)) return fail("Refusing to store something that looks like a secret.");
      const fact = saveFact(text, String(args.tag || "general"));
      return ok(`Remembered: ${fact.text}`, [{ type: "memory", fact }]);
    },
  },

  {
    name: "memory_recall",
    description: "Search the agent's long-term memory for facts relevant to the current task.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    async run(args) {
      const facts = recallFacts(String(args.query || ""), 8);
      if (!facts.length) return ok("No stored memories matched that query.");
      return ok(facts.map((f) => `- [${f.tag}] ${f.text}`).join("\n"));
    },
  },

  {
    name: "plan",
    description: "Publish the visible step plan for a multi-step job so the user can watch progress. Call once at the start of complex work.",
    parameters: {
      type: "object",
      properties: { steps: { type: "array", items: { type: "string" } } },
      required: ["steps"],
    },
    async run(args) {
      const steps = (Array.isArray(args.steps) ? args.steps : []).map(String).slice(0, 12);
      if (!steps.length) return fail("plan needs steps");
      return ok(`Plan published: ${steps.join(" → ")}`, [{ type: "plan", steps }]);
    },
  },

  {
    name: "ask_user",
    description: "Ask the user a clarifying question with clickable options when the task is genuinely ambiguous. Use sparingly.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } },
      },
      required: ["question"],
    },
    clientOnly: true,
  },

  {
    name: "current_time",
    description: "Get the current date, time and timezone. Use whenever 'today', 'this week' or recency matters.",
    parameters: { type: "object", properties: {} },
    async run() {
      const now = new Date();
      return ok(
        `Now: ${now.toISOString()} (${now.toLocaleString("en-GB", { timeZone: "Africa/Accra" })} Africa/Accra, GMT+0)`,
      );
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolSpecs(allow: string[] = TOOLS.map((t) => t.name)): ToolCallSpec[] {
  return TOOLS.filter((t) => allow.includes(t.name)).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function isClientTool(name: string) {
  return TOOL_MAP.get(name)?.clientOnly === true;
}

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<ToolOutcome> {
  const tool = TOOL_MAP.get(name);
  if (!tool) return fail(`Unknown tool "${name}".`);
  if (tool.clientOnly) {
    return { output: "", ok: true, events: [], client: { name, payload: args } };
  }
  if (!tool.run) return fail(`Tool "${name}" is not executable on the server.`);
  try {
    return await tool.run(args, ctx);
  } catch (err) {
    return fail(`Tool ${name} failed: ${(err as Error).message}`);
  }
}

/** Capability inventory surfaced in the UI "what can this do" panel. */
export const AGENT_SYSTEM_PROMPT = `${GHANA_CONTEXT}

You are ONE HEALTH AI - the flagship agent of the Ghana Health Service ONE HEALTH platform.
You match or beat the general-purpose assistants (ChatGPT, Claude, Copilot, Arena Agent Mode) while being
specialised for One Health surveillance in Ghana.

WHAT YOU CAN DO (call tools; never pretend you did something you did not):
- Live internet: web_search (Tavily), web_fetch, deep_research for sourced multi-step reports.
- Vision: vision_read on any attached photo, PDF, Word, Excel or CSV.
- Images: image_generate (new AI art/infographics) and image_search (real Unsplash stock photos).
- Code + sandbox: create_file, sandbox_exec (JavaScript/HTML/Python in an isolated browser sandbox). Verify code you write by running it.
- Data: chart, table, compute (deterministic maths), ghana_forecast, ghana_national_table, weather_now.
- Memory: memory_save / memory_recall across sessions; the user's stored facts are given to you each turn.
- Planning: plan, ask_user.

HOW TO WORK
1. For multi-step jobs call plan first, then work through it.
2. Prefer tools over memory for anything current, numeric or verifiable. Run the code instead of guessing the result.
3. Cite URLs inline as [n](url) when you used web results. Distinguish live sources from model knowledge.
4. Render structure: use chart for trends, table for comparisons, create_file for deliverables, sandbox_exec for verification.
5. Keep answers tight and skimmable: short paragraphs, headings, bullets. No preamble, no "as an AI".
6. Health content: decision support only. Intervals, not certainty. An alert is an investigation prompt, never a confirmed outbreak. No diagnosis of an individual from a photo. Never echo patient names, folder numbers or phone numbers.
7. If a tool fails, say so plainly and continue with what you have - do not silently invent the result.`;
