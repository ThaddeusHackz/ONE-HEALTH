export interface Redaction {
  count: number;
  kinds: string[];
  text: string;
}

const RULES: { kind: string; re: RegExp }[] = [
  { kind: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "ghana-phone", re: /(?:\+233|00233|0)\s*[-.]?\s*[235]\d{1,2}(?:[\s.-]?\d{3}){2}\b/g },
  { kind: "folder-no", re: /\b(?:OPD|IPD|NHIS|FOLDER|HOSP|MRN)[\s:/#-]*[A-Z0-9-]{4,}\b/gi },
  { kind: "long-id", re: /\b\d{8,}\b/g },
  { kind: "labeled-name", re: /\b(?:patient|name|next of kin|guardian)\s*[:\-]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}/gi },
];

export function redactText(input: string): Redaction {
  let text = input || "";
  const kinds = new Set<string>();
  let count = 0;
  for (const rule of RULES) {
    text = text.replace(rule.re, () => {
      kinds.add(rule.kind);
      count += 1;
      return `[REDACTED:${rule.kind}]`;
    });
  }
  return { count, kinds: [...kinds], text };
}

export function redactMessages<T extends { content: string }>(messages: T[]): T[] {
  return messages.map((m) => ({ ...m, content: redactText(m.content).text }));
}
