import { unzipSync, unzlibSync } from "fflate";

export interface ExtractedFile {
  name: string;
  type: string;
  size: number;
  kind: "image" | "pdf" | "text" | "office" | "data" | "audio" | "binary";
  text: string;
  dataUrl?: string;
}

const TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html|log|tsv|yaml|yml)$/i;

export async function extractFile(file: File): Promise<ExtractedFile> {
  const buf = Buffer.from(await file.arrayBuffer());
  const type = file.type || guessType(file.name);
  const name = file.name || "upload";
  const size = buf.length;
  const lower = name.toLowerCase();

  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tif|heic)$/i.test(lower)) {
    const mime = type.startsWith("image/") ? type : "image/jpeg";
    return { name, type: mime, size, kind: "image", text: "", dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  }

  if (type === "application/pdf" || lower.endsWith(".pdf")) {
    const text = extractPdfText(buf);
    return {
      name,
      type: "application/pdf",
      size,
      kind: "pdf",
      text,
      dataUrl: `data:application/pdf;base64,${buf.toString("base64")}`,
    };
  }

  if (type.startsWith("audio/") || /\.(webm|mp3|wav|m4a|ogg)$/i.test(lower)) {
    return {
      name,
      type: type || "audio/webm",
      size,
      kind: "audio",
      text: "",
      dataUrl: `data:${type || "audio/webm"};base64,${buf.toString("base64")}`,
    };
  }

  if (lower.endsWith(".docx") || type.includes("wordprocessingml")) {
    return { name, type, size, kind: "office", text: extractDocx(buf) };
  }

  if (lower.endsWith(".xlsx") || type.includes("spreadsheetml")) {
    return { name, type, size, kind: "office", text: extractXlsx(buf) };
  }

  if (type.startsWith("text/") || TEXT_EXT.test(lower)) {
    return { name, type: type || "text/plain", size, kind: lower.endsWith(".csv") ? "data" : "text", text: buf.toString("utf8").slice(0, 40000) };
  }

  const asText = buf.toString("utf8");
  const printable = asText.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "").length;
  if (printable > asText.length * 0.7 && asText.length > 20) {
    return { name, type, size, kind: "text", text: asText.slice(0, 40000) };
  }

  return {
    name,
    type,
    size,
    kind: "binary",
    text: `Binary file (${Math.round(size / 1024)} KB, ${type || "unknown"}). Vision models will attempt a direct file read when the format is supported.`,
    dataUrl: `data:${type || "application/octet-stream"};base64,${buf.toString("base64")}`,
  };
}

function guessType(name: string) {
  const l = name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
  if (l.endsWith(".csv")) return "text/csv";
  if (l.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function extractDocx(buf: Buffer): string {
  try {
    const files = unzipSync(new Uint8Array(buf));
    const xml = files["word/document.xml"];
    if (!xml) return "DOCX had no word/document.xml";
    const raw = Buffer.from(xml).toString("utf8");
    return raw
      .replace(/<w:p[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 40000);
  } catch (err) {
    return `Could not read DOCX: ${(err as Error).message}`;
  }
}

function extractXlsx(buf: Buffer): string {
  try {
    const files = unzipSync(new Uint8Array(buf));
    const shared = files["xl/sharedStrings.xml"]
      ? Buffer.from(files["xl/sharedStrings.xml"]).toString("utf8")
      : "";
    const strings = [...shared.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]);
    const sheets = Object.keys(files).filter((k) => k.startsWith("xl/worksheets/sheet"));
    const lines: string[] = [];
    for (const sheet of sheets.slice(0, 4)) {
      const xml = Buffer.from(files[sheet]).toString("utf8");
      const cells = [...xml.matchAll(/<v>([^<]*)<\/v>/g)].map((m) => m[1]);
      const decoded = cells.map((v) => {
        const n = Number(v);
        return Number.isInteger(n) && strings[n] ? strings[n] : v;
      });
      lines.push(`# ${sheet}\n${decoded.join(" | ")}`);
    }
    return (lines.join("\n\n") || "Empty workbook").slice(0, 40000);
  } catch (err) {
    return `Could not read XLSX: ${(err as Error).message}`;
  }
}

/**
 * PDF text extraction, done properly.
 *
 * The 2025 extractor matched `stream\r\n` INSIDE the word "endstream", so it
 * read the binary object table BETWEEN streams instead of the streams
 * themselves - on the Phase 2 workbook it returned 40,000 characters of
 * mojibake that then poisoned every model prompt. This version:
 *
 *   1. matches stream boundaries that are NOT part of "endstream",
 *   2. inflates FlateDecode streams (zlib, via fflate's unzlibSync) - the
 *      standard for any PDF produced after ~2003,
 *   3. decodes the real text-show operators: (str) Tj, [(a) -120 (b)] TJ and
 *      <hex> Tj, with PDF string escapes (octal, \\n, \\(, \\\) resolved.
 *
 * It is a text LAYER reader, not a layout engine - scanned PDFs with no text
 * layer still need the Gemini vision engine, which is exactly what the
 * ingest/vision pipeline does with the inlineData part.
 */
function extractPdfText(buf: Buffer): string {
  try {
    const raw = buf.toString("latin1");
    const streams = [...raw.matchAll(/(?<!end)stream\r?\n([\s\S]*?)endstream/g)];

    const decoded: string[] = [];
    for (const m of streams) {
      const dictHead = raw.slice(Math.max(0, m.index - 500), m.index);
      const body = m[1];
      if (/FlateDecode/.test(dictHead)) {
        try {
          // Trim the EOL that PDF writers place before "endstream"; fflate is
          // strict about trailing bytes where Node's zlib is not.
          const bytes = Buffer.from(body.replace(/[\r\n\s]+$/, ""), "latin1");
          const inflated = unzlibSync(new Uint8Array(bytes));
          decoded.push(Buffer.from(inflated).toString("latin1"));
        } catch {
          // Corrupt or truncated stream - skip it, the next one may be fine.
        }
      } else {
        decoded.push(body);
      }
    }

    const all = decoded.join("\n");
    const pieces: string[] = [];

    // (string) Tj - show text
    for (const m of all.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) pieces.push(m[1]);
    // [ (a) -120 (b) 34 (c) ] TJ - show text with kerning offsets
    for (const m of all.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ/g)) {
      for (const s of m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) pieces.push(s[1]);
    }
    // <hex> Tj - hex-encoded strings (usually CID fonts; kept as raw bytes)
    for (const m of all.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
      const hex = m[1].replace(/\s+/g, "");
      if (hex.length % 2 === 0 && hex.length <= 512) pieces.push(Buffer.from(hex, "hex").toString("latin1"));
    }

    let text = pieces.join("");
    text = text
      .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
      .replace(/\\([nrtbf])/g, (_, c: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[c] ?? c))
      .replace(/\\([()\\])/g, "$1");
    // Drop control bytes that survive CID fonts; keep whitespace structure.
    text = text.replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u024f]/g, " ").replace(/[ ]{2,}/g, " ").trim();
    return text.slice(0, 40000);
  } catch {
    return "";
  }
}
