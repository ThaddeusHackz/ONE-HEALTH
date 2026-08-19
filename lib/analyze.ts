import { extractFile, type ExtractedFile } from "./files";
import { openRouterConfigured, visionAnalyze } from "./openrouter";
import type { DocumentRow } from "./records";
import { logActivity, saveDB, uid } from "./store";

export async function analyzeUploads(opts: {
  files: File[];
  prompt?: string;
  kind?: string;
}): Promise<{ analysis: string; model: string; extracted: ExtractedFile[]; saved: DocumentRow[] }> {
  const extracted: ExtractedFile[] = [];
  for (const file of opts.files.slice(0, 8)) {
    extracted.push(await extractFile(file));
  }

  const images = extracted.filter((e) => e.kind === "image" && e.dataUrl).map((e) => e.dataUrl!);
  const pdfs = extracted
    .filter((e) => e.kind === "pdf" && e.dataUrl)
    .map((e) => ({ filename: e.name, file_data: e.dataUrl! }));
  const textBlock = extracted
    .filter((e) => e.text)
    .map((e) => `## ${e.name} (${e.kind})\n${e.text.slice(0, 8000)}`)
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
${textBlock || "(no text layer — rely on vision / file parts)"}`;

  let analysis = "";
  let model = "local-extract";

  if (openRouterConfigured()) {
    try {
      const r = await visionAnalyze({
        prompt,
        images: images.slice(0, 6),
        files: pdfs.slice(0, 3),
        extraSystem:
          "Ghana Health Service document intelligence. Extract structured surveillance fields. Never diagnose an individual. Never claim certainty.",
      });
      analysis = r.text;
      model = r.model;
    } catch (err) {
      analysis = `Model read failed: ${(err as Error).message}\n\nLocal extracts still stored.\n\n${textBlock.slice(0, 3000)}`;
      model = "extract-fallback";
    }
  } else {
    analysis = `OpenRouter key not loaded. Local extracts:\n\n${textBlock.slice(0, 4000) || "Images queued — connect the key to read them."}`;
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

  return { analysis, model, extracted, saved };
}

function defaultPrompt(kind?: string) {
  if (kind === "clinical") return "Review these clinical or field photographs for public-health surveillance clues in Ghana.";
  if (kind === "lab") return "Read these laboratory or RDT result sheets as surveillance documents.";
  if (kind === "environment") return "Interpret these environmental or veterinary artefacts for One Health risk in Ghana.";
  return "Read these public-health documents, forms, spreadsheets, PDFs, or scans.";
}
