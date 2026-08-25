/**
 * Diagram source handling for the AI Agent.
 *
 * Every major assistant - ChatGPT, Claude artifacts and Microsoft 365 Copilot -
 * uses Mermaid as its diagram interchange: the model writes text, a renderer
 * turns it into SVG. That is the pattern adopted here, with two hardening steps
 * the commercial products had to learn the hard way:
 *
 *   1. Repair, then validate. Models emit broken Mermaid constantly: `end` used
 *      as a node label (a reserved word), smart quotes, unquoted brackets and
 *      parentheses, stray semicolons. A blank diagram is worse than an error, so
 *      the source is normalised first and only then judged.
 *   2. Strip interactivity. Mermaid supports `click Node "https://…"` and
 *      `%%{init: …}%%` theme injection. Microsoft removed both from rendered
 *      diagrams after a documented exfiltration payload smuggled tenant data out
 *      through a "login button" flowchart. Diagrams here render with
 *      `securityLevel: "strict"` and any directive is removed on the way in, so
 *      a diagram can never carry a link, a script or a style.
 *
 * Pure TypeScript on purpose: the same code validates on the server (so the tool
 * can tell the model exactly what to fix) and normalises in the browser.
 */

export interface DiagramKind {
  id: string;
  label: string;
  /** Tokens that start this diagram type. */
  headers: string[];
}

export const DIAGRAM_KINDS: DiagramKind[] = [
  { id: "flowchart", label: "Flowchart", headers: ["flowchart", "graph"] },
  { id: "sequence", label: "Sequence", headers: ["sequencediagram"] },
  { id: "class", label: "Class", headers: ["classdiagram", "classdiagram-beta"] },
  { id: "state", label: "State", headers: ["statediagram", "statediagram-v2"] },
  { id: "er", label: "Entity relationship", headers: ["erdiagram"] },
  { id: "journey", label: "User journey", headers: ["journey"] },
  { id: "gantt", label: "Gantt", headers: ["gantt"] },
  { id: "pie", label: "Pie", headers: ["pie"] },
  { id: "quadrant", label: "Quadrant", headers: ["quadrantchart"] },
  { id: "requirement", label: "Requirement", headers: ["requirementdiagram", "requirement"] },
  { id: "git", label: "Git graph", headers: ["gitgraph", "gitgraph-beta"] },
  { id: "mindmap", label: "Mind map", headers: ["mindmap"] },
  { id: "timeline", label: "Timeline", headers: ["timeline"] },
  { id: "sankey", label: "Sankey", headers: ["sankey-beta", "sankey"] },
  { id: "xychart", label: "XY chart", headers: ["xychart-beta", "xychart"] },
  { id: "block", label: "Block", headers: ["block-beta", "block"] },
  { id: "kanban", label: "Kanban", headers: ["kanban"] },
  { id: "packet", label: "Packet", headers: ["packet-beta", "packet"] },
  { id: "architecture", label: "Architecture", headers: ["architecture-beta", "architecture"] },
  { id: "c4", label: "C4 model", headers: ["c4context", "c4container", "c4component", "c4dynamic", "c4deployment"] },
  { id: "zenuml", label: "ZenUML", headers: ["zenuml"] },
];

/** Mermaid words that cannot be used bare as a node id or label. */
const RESERVED = new Set([
  "end",
  "subgraph",
  "graph",
  "flowchart",
  "direction",
  "classdef",
  "class",
  "click",
  "link",
  "callback",
]);

const HEADER_RE = /^([a-zA-Z][a-zA-Z0-9-]*)/;

export function detectDiagramKind(source: string): DiagramKind | null {
  for (const line of String(source || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) continue;
    const head = trimmed.match(HEADER_RE)?.[1].toLowerCase();
    if (!head) continue;
    return DIAGRAM_KINDS.find((k) => k.headers.includes(head)) || null;
  }
  return null;
}

function balanced(text: string): boolean {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const open = new Set(Object.keys(pairs));
  const close = new Set(Object.values(pairs));
  let depth = 0;
  let quote: string | null = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (open.has(ch)) depth += 1;
    else if (close.has(ch)) {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && quote === null;
}

/** Quote a label that contains characters Mermaid will otherwise choke on. */
function quoteIfNeeded(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return null;
  if (RESERVED.has(trimmed.toLowerCase())) return `"${trimmed}"`;
  if (/[()[\]{}#:;,|<>=]/.test(trimmed)) return `"${trimmed.replace(/"/g, "'")}"`;
  return null;
}

/**
 * Normalise model output into something a Mermaid renderer will accept.
 * Every repair is reported so the change is auditable rather than silent.
 */
export function normaliseDiagramSource(raw: string): { source: string; kind: string; repairs: string[] } {
  const repairs: string[] = [];
  let text = String(raw || "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");

  // Typographic quotes -> ASCII.
  const smart = text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'");
  if (smart !== text) {
    repairs.push("replaced typographic quotes with straight quotes");
    text = smart;
  }

  // Drop ```mermaid fences the model sometimes leaves in.
  const unfenced = text.replace(/^\s*```[a-zA-Z]*\s*\n?/gm, "").replace(/^\s*```\s*$/gm, "");
  if (unfenced !== text) {
    repairs.push("removed markdown code fences");
    text = unfenced;
  }

  // Security: no directives, no click callbacks, no embedded links.
  const noInit = text.replace(/^\s*%%\s*\{[\s\S]*?\}\s*%%\s*$/gm, "");
  if (noInit !== text) {
    repairs.push("removed %%{init}%% theme directive (not allowed in rendered diagrams)");
    text = noInit;
  }
  const noClick = text
    .split("\n")
    .filter((l) => !/^\s*(click|link|callback)\s/i.test(l))
    .join("\n");
  if (noClick !== text) {
    repairs.push("removed click/link/callback directives (diagrams are non-interactive)");
    text = noClick;
  }

  const lines = text.split("\n");
  const out: string[] = [];
  let sawHeader = false;
  const kind = detectDiagramKind(text);

  for (const line of lines) {
    let next = line.replace(/\s+$/g, "");
    const trimmed = next.trim();

    if (!trimmed) {
      out.push("");
      continue;
    }
    if (trimmed.startsWith("%%")) {
      out.push(next);
      continue;
    }

    if (!sawHeader) {
      sawHeader = true;
      out.push(next);
      // `flowchart` with no direction is ambiguous; Mermaid defaults to TD but
      // models frequently mean LR, and an explicit direction renders better.
      if (/^(flowchart|graph)\s*$/i.test(trimmed)) {
        out[out.length - 1] = `${trimmed} TD`;
        repairs.push("added default direction TD to flowchart");
      }
      continue;
    }

    // Bare `end` used as a node id - Mermaid's single most common model error.
    if (/(^|\s|\[|\(|\{)end(\s|\]|\)|\}|$)/.test(next) && !/["']end["']/.test(next)) {
      const fixed = next
        .replace(/(\s|^)end(\s*(?:-->|---|-\.\->|==>|:::|\||$))/g, '$1end_node$2')
        .replace(/\[end\]/g, '["end"]')
        .replace(/\(end\)/g, '("end")')
        .replace(/\{end\}/g, '{"end"}');
      if (fixed !== next) {
        repairs.push("renamed the reserved word `end` where it was used as a node");
        next = fixed;
      }
    }

    // Unquoted labels carrying punctuation, e.g. A[Cholera cases (weekly)]
    const labelled = next.replace(/(\w+)\[([^\]"]+)\]/g, (_m, id: string, label: string) => {
      const quoted = quoteIfNeeded(label);
      return quoted ? `${id}[${quoted}]` : `${id}[${label}]`;
    });
    if (labelled !== next) {
      repairs.push("quoted node labels containing punctuation");
      next = labelled;
    }

    // subgraph titles with spaces must be quoted: `subgraph Human health` is fine,
    // `subgraph Human health pillar` parses the first word as the id.
    const sub = next.match(/^(\s*)subgraph\s+(.+)$/i);
    if (sub && !/^\s*subgraph\s+[\w-]+\s*\[/.test(next)) {
      const title = sub[2].trim().replace(/;$/, "");
      if (title.includes(" ") && !title.startsWith('"')) {
        next = `${sub[1]}subgraph ${title.replace(/"/g, "'").replace(/^'|'$/g, "")}`;
        next = `${sub[1]}subgraph "${title.replace(/"/g, "'")}"`;
        repairs.push("quoted a multi-word subgraph title");
      }
    }

    out.push(next);
  }

  let source = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // A dangling semicolon at end of file breaks some parsers.
  source = source.replace(/;+\s*$/g, "").trim();

  const detected = detectDiagramKind(source);
  const label = detected?.label || kind?.label || "diagram";

  return {
    source,
    kind: label,
    repairs: [...new Set(repairs)],
  };
}

/**
 * Kinds where brackets genuinely delimit labels, so an imbalance is a real
 * error. ER uses `{` and `}` as cardinality markers (`||--o{`), and Gantt uses
 * free-text task lines, so a bracket count there is meaningless and would
 * reject perfectly good diagrams.
 */
const BRACKET_CHECKED = new Set([
  "flowchart",
  "sequence",
  "class",
  "state",
  "journey",
  "mindmap",
  "timeline",
  "quadrant",
  "git",
  "requirement",
]);

export interface DiagramCheck {
  ok: boolean;
  error?: string;
  line?: number;
}

/**
 * Structural validation. This is deliberately not a Mermaid parser - it catches
 * the failures that actually blank the screen (unknown diagram type, unbalanced
 * delimiters, an empty body) and reports the line number, which is what makes the
 * error actionable for the model instead of just "invalid".
 */
export function validateDiagramSource(source: string): DiagramCheck {
  const text = String(source || "").trim();
  if (!text) return { ok: false, error: "Diagram source is empty." };

  const lines = text.split("\n");
  const kind = detectDiagramKind(text);
  if (!kind) {
    const first = lines.find((l) => l.trim() && !l.trim().startsWith("%%"))?.trim() || "(blank)";
    return {
      ok: false,
      error: `Unrecognised diagram type. The first line must be one of: ${DIAGRAM_KINDS.map((k) => k.headers[0]).join(", ")}. Got: "${first.slice(0, 60)}"`,
      line: 1,
    };
  }

  const body = lines.filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("%%");
  });
  if (body.length < 2) {
    return { ok: false, error: `A ${kind.label.toLowerCase()} needs at least one line of content after the header.` };
  }

  const checkBrackets = BRACKET_CHECKED.has(kind.id);
  let quote: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) continue;

    const quotes = (trimmed.match(/"/g) || []).length;
    if (quotes % 2 !== 0) quote = quote ? null : '"';
    if (quote) continue;

    if (checkBrackets && !balanced(trimmed)) {
      return { ok: false, error: `Unbalanced brackets, braces or parentheses: "${trimmed.slice(0, 80)}"`, line: i + 1 };
    }
  }
  if (quote) return { ok: false, error: "An unterminated double quote leaves the diagram unparseable." };

  if (kind.id === "flowchart") {
    const edges = body.slice(1).filter((l) => /-->|---|-\.->|==>|--x|--o|~~~/.test(l));
    const nodes = body.slice(1).filter((l) => /^(subgraph|end|direction|classDef|class|style|linkStyle)\b/i.test(l));
    if (!edges.length && !nodes.length) {
      return { ok: false, error: "A flowchart needs at least one connection (A --> B) or a subgraph." };
    }
  }

  return { ok: true };
}

/** One-shot prepare used by the tool and the renderer. */
export function prepareDiagram(raw: string): {
  ok: boolean;
  source: string;
  kind: string;
  repairs: string[];
  error?: string;
  line?: number;
} {
  const { source, kind, repairs } = normaliseDiagramSource(raw);
  const check = validateDiagramSource(source);
  return { ok: check.ok, source, kind, repairs, error: check.error, line: check.line };
}
