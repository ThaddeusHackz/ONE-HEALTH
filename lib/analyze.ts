import { extractFile, type ExtractedFile } from "./files";
import { geminiConfigured, geminiVision } from "./agent/gemini";
import { redactText } from "./redact";
import type { DocumentRow } from "./records";
import { logActivity, recordAudit, saveDB, uid } from "./store";

/**
 * Document + image reading for the Vision Lab, One Health ingest and every
 * other surface that must SEE a file.
 *
 * VISION IS GEMINI-ONLY. It runs on the independent GEMINI_API_KEY from Google
 * AI Studio (aistudio.google.com/apikey) - never on the OpenRouter key. There
 * is deliberately NO OpenRouter vision fallback: the platform's contract is
 * that one key (the Gemini key) is the vision engine, so a failure says so
 * plainly instead of silently switching providers.
 */
export async function analyzeUploads(opts: {
  files: File[];
  prompt?: string;
  kind?: string;
}): Promise<{ analysis: string; model: string; extracted: ExtractedFile[]; saved: DocumentRow[]; redactions: number }> {
  const extracted: ExtractedFile[] = [];
  for (const file of opts.files.slice(0, 8)) {
    extracted.push(await extractFile(file));
  }

  const images = extracted.filter((e) => e.kind === "image" && e.dataUrl).map((e) => e.dataUrl!);
  const pdfs = extracted
    .filter((e) => e.kind === "pdf" && e.dataUrl)
    .map((e) => ({ filename: e.name, file_data: e.dataUrl! }));
  let redactions = 0;
  const textBlock = extracted
    .filter((e) => e.text)
    .map((e) => {
      const red = redactText(e.text.slice(0, 8000));
      redactions += red.count;
      e.text = red.text;
      return `## ${e.name} (${e.kind})\n${red.text}`;
    })
    .join("\n\n");

  const prompt = `${opts.prompt || defaultPrompt(opts.kind)}

You are ingesting surveillance artefacts for GHANA ONLY.

Return markdown with:
1. What each file actually contains (no invention)
2. Structured fields: disease/condition, Ghana region/district if present, dates, counts, facility
3. Fitness for the weekly forecasting engine (usable / needs cleaning / reject)
4. Data-quality flags and possible identifiers (do NOT repeat names, folder numbers, phones, faces)
5. One Health relevance for Ghana Health Service
6. Confidence (low / moderate / high) and the next human verification step

TEXT EXTRACTS:
${textBlock || "(no text layer - rely on vision / file parts)"}`;

  let analysis = "";
  let model = "local-extract";

  const extraSystem =
    "Ghana Health Service document intelligence. Extract structured surveillance fields. Never diagnose an individual. Never claim certainty.";

  if (geminiConfigured()) {
    try {
      const r = await geminiVision({
        prompt,
        images: images.slice(0, 6),
        files: pdfs.slice(0, 3),
        extraSystem,
      });
      analysis = r.text;
      model = `gemini:${r.model}`;
    } catch (err) {
      analysis =
        `Gemini vision read failed: ${(err as Error).message}\n\n` +
        `The file(s) were NOT read by any model. Local extracts (text layer only) are still stored below.\n\n` +
        `${textBlock.slice(0, 3000) || "(no local text layer - images and scans need the Gemini engine)"}`;
      model = "extract-fallback";
    }
  } else {
    analysis =
      `No GEMINI_API_KEY is configured, so the vision engine is off.\n\n` +
      `Set GEMINI_API_KEY (an independent key from https://aistudio.google.com/apikey) to read images, PDFs and scans. ` +
      `Vision and document reading run ONLY on the Gemini key - the OpenRouter key is never used to see files.\n\n` +
      `Local extracts stored:\n\n${textBlock.slice(0, 4000) || "(none - this file type has no local text layer)"}`;
    model = "no-vision-key";
  }

  const saved: DocumentRow[] = [];
  saveDB((db) => {
    for (const e of extracted) {
      const row: DocumentRow = {
        id: uid("doc"),
        name: e.name,
        type: e.type,
        size: e.size,
        kind: opts.kind || e.kind,
        analysis,
        model,
        createdAt: new Date().toISOString(),
      };
      db.documents.unshift(row);
      saved.push(row);
    }
    db.documents = db.documents.slice(0, 400);
  });
  logActivity("system", "ingest", saved.map((s) => s.name).join(", "));
  recordAudit({
    actor: "vision",
    action: "document.analyze",
    model,
    redactions,
    detail: saved.map((s) => s.name).join(", "),
  });

  return { analysis, model, extracted, saved, redactions };
}

function defaultPrompt(kind?: string) {
  if (kind === "clinical") return "Review these clinical or field photographs for public-health surveillance clues in Ghana.";
  if (kind === "lab") return "Read these laboratory or RDT result sheets as surveillance documents.";
  if (kind === "environment") return "Interpret these environmental or veterinary artefacts for One Health risk in Ghana.";
  return "Read these public-health documents, forms, spreadsheets, PDFs, or scans.";
}
