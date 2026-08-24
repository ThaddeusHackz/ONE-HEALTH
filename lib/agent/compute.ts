/**
 * Deterministic math without `eval`/`Function`.
 * Tokeniser + shunting-yard parser over a restricted grammar:
 *   numbers, arrays [1,2,3], unary minus, + - * / % ^, parentheses,
 *   constants pi/e, and a fixed function table.
 */

type Token =
  | { t: "num"; v: number }
  | { t: "arr"; v: number[] }
  | { t: "op"; v: string }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "lbracket" }
  | { t: "rbracket" }
  | { t: "comma" }
  | { t: "ident"; v: string };

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

const OPS: Record<string, { prec: number; right?: boolean; apply: (a: number, b: number) => number }> = {
  "+": { prec: 1, apply: (a, b) => a + b },
  "-": { prec: 1, apply: (a, b) => a - b },
  "*": { prec: 2, apply: (a, b) => a * b },
  "/": { prec: 2, apply: (a, b) => (b === 0 ? NaN : a / b) },
  "%": { prec: 2, apply: (a, b) => (b === 0 ? NaN : a % b) },
  "^": { prec: 4, right: true, apply: (a, b) => Math.pow(a, b) },
};

const FUNCS: Record<string, (args: (number | number[])[]) => number> = {
  sqrt: (a) => Math.sqrt(first(a)),
  abs: (a) => Math.abs(first(a)),
  round: (a) => Math.round(first(a)),
  floor: (a) => Math.floor(first(a)),
  ceil: (a) => Math.ceil(first(a)),
  exp: (a) => Math.exp(first(a)),
  ln: (a) => Math.log(first(a)),
  log: (a) => (a.length > 1 ? Math.log(first(a)) / Math.log(num(a[1])) : Math.log10(first(a))),
  log10: (a) => Math.log10(first(a)),
  log2: (a) => Math.log2(first(a)),
  sin: (a) => Math.sin(first(a)),
  cos: (a) => Math.cos(first(a)),
  tan: (a) => Math.tan(first(a)),
  asin: (a) => Math.asin(first(a)),
  acos: (a) => Math.acos(first(a)),
  atan: (a) => Math.atan(first(a)),
  pow: (a) => Math.pow(first(a), num(a[1])),
  min: (a) => Math.min(...flat(a)),
  max: (a) => Math.max(...flat(a)),
  sum: (a) => flat(a).reduce((s, v) => s + v, 0),
  mean: (a) => mean(flat(a)),
  avg: (a) => mean(flat(a)),
  median: (a) => median(flat(a)),
  stdev: (a) => stdev(flat(a)),
  std: (a) => stdev(flat(a)),
  var: (a) => variance(flat(a)),
  percentile: (a) => percentile(flat(a), num(a[1])),
  range: (a) => {
    const v = flat(a);
    return v.length ? Math.max(...v) - Math.min(...v) : NaN;
  },
  cagr: (a) => {
    const [start, end, years] = [first(a), num(a[1]), num(a[2])];
    return years > 0 && start > 0 ? Math.pow(end / start, 1 / years) - 1 : NaN;
  },
};

function first(args: (number | number[])[]): number {
  const v = args[0];
  if (Array.isArray(v)) return v.length ? v[0] : NaN;
  return typeof v === "number" ? v : NaN;
}

function num(v: number | number[] | undefined): number {
  if (Array.isArray(v)) return v.length ? v[0] : NaN;
  return typeof v === "number" ? v : NaN;
}

function flat(args: (number | number[])[]): number[] {
  const out: number[] = [];
  for (const a of args) if (Array.isArray(a)) out.push(...a.filter(Number.isFinite));
  else if (typeof a === "number" && Number.isFinite(a)) out.push(a);
  return out;
}

function mean(v: number[]) {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
}

function variance(v: number[]) {
  if (v.length < 2) return 0;
  const m = mean(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}

function stdev(v: number[]) {
  return Math.sqrt(variance(v));
}

function median(v: number[]) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(v: number[], p: number) {
  if (!v.length || !Number.isFinite(p)) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const idx = (Math.min(Math.max(p, 0), 100) / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j += 1;
      // scientific notation
      if (src[j] === "e" || src[j] === "E") {
        let k = j + 1;
        if (src[k] === "+" || src[k] === "-") k += 1;
        if (/[0-9]/.test(src[k] || "")) {
          j = k;
          while (j < src.length && /[0-9]/.test(src[j])) j += 1;
        }
      }
      const v = Number(src.slice(i, j).replace(/_/g, ""));
      if (!Number.isFinite(v)) throw new Error(`Bad number near "${src.slice(i, j)}"`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j += 1;
      out.push({ t: "ident", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if (c === "(") out.push({ t: "lparen" });
    else if (c === ")") out.push({ t: "rparen" });
    else if (c === "[") out.push({ t: "lbracket" });
    else if (c === "]") out.push({ t: "rbracket" });
    else if (c === ",") out.push({ t: "comma" });
    else if ("+-*/%^".includes(c)) out.push({ t: "op", v: c });
    else throw new Error(`Unexpected character "${c}"`);
    i += 1;
  }
  return out;
}

type Node =
  | { k: "num"; v: number }
  | { k: "arr"; v: Node[] }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "neg"; a: Node }
  | { k: "call"; name: string; args: Node[] };

export function evaluateExpression(input: string): { ok: boolean; value?: string; error?: string } {
  try {
    const tokens = tokenize(input);
    const { node, index } = parseExpression(tokens, 0);
    if (index !== tokens.length) throw new Error("Trailing input");
    const value = evaluate(node);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Result is not finite");
      return { ok: true, value: format(value) };
    }
    return { ok: true, value: `[${value.map(format).join(", ")}]` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function format(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return String(Number(n.toPrecision(12)));
}

function parseExpression(tokens: Token[], start: number): { node: Node; index: number } {
  let { node: left, index } = parseTerm(tokens, start);
  for (;;) {
    const tk = tokens[index];
    if (tk?.t !== "op" || tk.v === "^") break;
    if (tk.v !== "+" && tk.v !== "-" && tk.v !== "*" && tk.v !== "/" && tk.v !== "%") break;
    const right = parseTerm(tokens, index + 1);
    left = { k: "bin", op: tk.v, a: left, b: right.node };
    index = right.index;
  }
  return { node: left, index };
}

function parseTerm(tokens: Token[], start: number): { node: Node; index: number } {
  let { node: left, index } = parseUnary(tokens, start);
  while (tokens[index]?.t === "op" && (tokens[index] as { v: string }).v === "^") {
    const right = parseUnary(tokens, index + 1);
    left = { k: "bin", op: "^", a: left, b: right.node };
    index = right.index;
  }
  return { node: left, index };
}

function parseUnary(tokens: Token[], start: number): { node: Node; index: number } {
  const tk = tokens[start];
  if (tk?.t === "op" && (tk.v === "-" || tk.v === "+")) {
    const inner = parseUnary(tokens, start + 1);
    return tk.v === "-"
      ? { node: { k: "neg", a: inner.node }, index: inner.index }
      : inner;
  }
  return parseAtom(tokens, start);
}

function parseAtom(tokens: Token[], start: number): { node: Node; index: number } {
  const tk = tokens[start];
  if (!tk) throw new Error("Unexpected end of expression");

  if (tk.t === "num") return { node: { k: "num", v: tk.v }, index: start + 1 };

  if (tk.t === "lparen") {
    const inner = parseExpression(tokens, start + 1);
    expect(tokens, inner.index, "rparen");
    return { node: inner.node, index: inner.index + 1 };
  }

  if (tk.t === "lbracket") {
    const items: Node[] = [];
    let index = start + 1;
    if (tokens[index]?.t !== "rbracket") {
      for (;;) {
        const item = parseExpression(tokens, index);
        items.push(item.node);
        index = item.index;
        if (tokens[index]?.t === "comma") {
          index += 1;
          continue;
        }
        break;
      }
    }
    expect(tokens, index, "rbracket");
    return { node: { k: "arr", v: items }, index: index + 1 };
  }

  if (tk.t === "ident") {
    const name = tk.v;
    if (tokens[start + 1]?.t === "lparen") {
      const args: Node[] = [];
      let index = start + 2;
      if (tokens[index]?.t !== "rparen") {
        for (;;) {
          const arg = parseExpression(tokens, index);
          args.push(arg.node);
          index = arg.index;
          if (tokens[index]?.t === "comma") {
            index += 1;
            continue;
          }
          break;
        }
      }
      expect(tokens, index, "rparen");
      if (!FUNCS[name]) throw new Error(`Unknown function "${name}"`);
      return { node: { k: "call", name, args }, index: index + 1 };
    }
    if (name in CONSTANTS) return { node: { k: "num", v: CONSTANTS[name] }, index: start + 1 };
    throw new Error(`Unknown name "${name}"`);
  }

  throw new Error("Unexpected token");
}

function expect(tokens: Token[], index: number, type: Token["t"]) {
  if (tokens[index]?.t !== type) throw new Error(`Expected ${type} at position ${index}`);
}

function evaluate(node: Node): number | number[] {
  switch (node.k) {
    case "num":
      return node.v;
    case "arr":
      return node.v.map((n) => {
        const v = evaluate(n);
        return Array.isArray(v) ? v[0] : v;
      });
    case "neg": {
      const v = evaluate(node.a);
      return Array.isArray(v) ? v.map((x) => -x) : -v;
    }
    case "bin": {
      const a = evaluate(node.a);
      const b = evaluate(node.b);
      const av = Array.isArray(a) ? a[0] : a;
      const bv = Array.isArray(b) ? b[0] : b;
      return OPS[node.op].apply(av, bv);
    }
    case "call":
      return FUNCS[node.name](node.args.map((arg) => evaluate(arg)));
  }
}
