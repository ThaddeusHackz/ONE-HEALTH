import { existsSync } from "node:fs";
import { mkdir, stat, statfs, unlink, appendFile, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Large workspace uploads (up to 2 GB per file).
 *
 * Small agent artefacts live in the snapshot DB (memory.ts, ~120 KB cap).
 * Big files - datasets, video, high-resolution scans - are streamed to disk in
 * CHUNKS so a 512 MB Render instance never holds more than one chunk in RAM:
 *
 *   1. init      → { uploadId }             (registry entry, .part file created)
 *   2. chunk     → append 4-8 MB of bytes   (client sends sequentially)
 *   3. complete  → finalise + list in the   workspace Files panel
 *
 * The registry is a plain JSON file under data/uploads (already gitignored),
 * so it survives alongside the DB snapshot and needs no schema migration.
 */

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const REGISTRY_PATH = join(UPLOAD_DIR, "registry.json");

/** The hard per-file ceiling the UI promises: 2 GB. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
/** Default chunk size the client should send. */
export const CHUNK_SIZE = 6 * 1024 * 1024;
/** Keep the uploads directory from quietly eating the whole disk. */
const MAX_TOTAL_BYTES = 6 * 1024 * 1024 * 1024;

export interface UploadEntry {
  id: string;
  name: string;
  safeName: string;
  mime: string;
  bytes: number;
  declaredBytes: number;
  status: "uploading" | "complete" | "aborted";
  createdAt: string;
  updatedAt: string;
}

interface Registry {
  uploads: UploadEntry[];
}

async function readRegistry(): Promise<Registry> {
  try {
    const raw = await readFile(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw) as Registry;
    return Array.isArray(parsed.uploads) ? parsed : { uploads: [] };
  } catch {
    return { uploads: [] };
  }
}

async function writeRegistry(reg: Registry): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(REGISTRY_PATH, JSON.stringify(reg, null, 2), "utf8");
}

function sanitize(name: string): string {
  const base = (name || "upload.bin")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return base || "upload.bin";
}

/** Rough text detection so the Files panel can offer "Open" for uploads. */
export function isTextLike(name: string, mime = ""): boolean {
  if (/^text\//i.test(mime)) return true;
  if (/json|xml|yaml|csv|javascript|typescript|x-sh|x-python/i.test(mime)) return true;
  return /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|js|mjs|ts|tsx|jsx|py|r|sql|html?|css|svg|log|ini|conf|env|gitignore)$/i.test(
    name,
  );
}

async function diskFree(dir: string): Promise<number | null> {
  try {
    // statfs: Node ≥ 18.15. Not available on every filesystem - then we just
    // trust the totals cap.
    const s = await statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export async function totalUploadBytes(): Promise<number> {
  const reg = await readRegistry();
  return reg.uploads
    .filter((u) => u.status !== "aborted")
    .reduce((n, u) => n + (u.bytes || 0), 0);
}

export async function initUpload(opts: {
  name: string;
  size: number;
  mime?: string;
}): Promise<{ uploadId: string; chunkSize: number; maxBytes: number }> {
  const size = Math.max(0, Math.floor(Number(opts.size) || 0));
  if (size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is ${(size / 1024 ** 3).toFixed(2)} GB - the workspace limit is 2 GB per file.`);
  }
  const reg = await readRegistry();
  const active = reg.uploads.filter((u) => u.status !== "aborted");
  const usedTotal = active.reduce((n, u) => n + (u.bytes || 0), 0);
  if (usedTotal + size > MAX_TOTAL_BYTES) {
    throw new Error(
      `Workspace storage is full (${(usedTotal / 1024 ** 3).toFixed(2)} GB used). Delete files before uploading more.`,
    );
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  const free = await diskFree(UPLOAD_DIR);
  if (free !== null && free < size + 256 * 1024 * 1024) {
    throw new Error(
      `Not enough disk space left on the server (${(free / 1024 ** 3).toFixed(2)} GB free) for this ${(size / 1024 ** 3).toFixed(2)} GB upload.`,
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const safeName = sanitize(opts.name);
  // A re-upload of the same display name supersedes earlier attempts.
  for (const prior of reg.uploads) {
    if (prior.name === (opts.name || "").slice(0, 160) && prior.status !== "aborted") {
      prior.status = "aborted";
      await unlink(partPath(prior)).catch(() => undefined);
    }
  }
  const entry: UploadEntry = {
    id,
    name: (opts.name || "upload.bin").slice(0, 160),
    safeName: `${id.slice(0, 8)}_${safeName}`,
    mime: (opts.mime || "application/octet-stream").slice(0, 120),
    bytes: 0,
    declaredBytes: size,
    status: "uploading",
    createdAt: now,
    updatedAt: now,
  };
  reg.uploads.unshift(entry);
  await writeRegistry(reg);
  // Create the part file so appendFile has something to append to.
  await writeFile(partPath(entry), "");
  return { uploadId: id, chunkSize: CHUNK_SIZE, maxBytes: MAX_UPLOAD_BYTES };
}

function partPath(entry: UploadEntry): string {
  return join(UPLOAD_DIR, entry.safeName);
}

function findEntry(reg: Registry, uploadId: string): UploadEntry | undefined {
  return reg.uploads.find((u) => u.id === uploadId);
}

/** Append one chunk. Returns the total bytes received for this upload. */
export async function appendChunk(uploadId: string, buf: Buffer): Promise<{ received: number }> {
  const reg = await readRegistry();
  const entry = findEntry(reg, uploadId);
  if (!entry) throw new Error("Unknown upload - it may have been aborted or the server restarted. Start again.");
  if (entry.status !== "uploading") throw new Error(`Upload is ${entry.status}; start a new upload.`);
  if (entry.bytes + buf.length > MAX_UPLOAD_BYTES) {
    entry.status = "aborted";
    await writeRegistry(reg);
    throw new Error("Upload exceeded the 2 GB per-file limit and was aborted.");
  }
  await appendFile(partPath(entry), buf);
  entry.bytes += buf.length;
  entry.updatedAt = new Date().toISOString();
  await writeRegistry(reg);
  return { received: entry.bytes };
}

export async function completeUpload(
  uploadId: string,
): Promise<{ entry: UploadEntry }> {
  const reg = await readRegistry();
  const entry = findEntry(reg, uploadId);
  if (!entry) throw new Error("Unknown upload.");
  if (entry.status !== "uploading") throw new Error(`Upload is already ${entry.status}.`);
  const st = await stat(partPath(entry)).catch(() => null);
  if (!st) {
    entry.status = "aborted";
    await writeRegistry(reg);
    throw new Error(
      "The partial upload was lost (the server restarted or its disk was wiped mid-transfer). Start the upload again.",
    );
  }
  entry.bytes = st.size;
  entry.status = "complete";
  entry.updatedAt = new Date().toISOString();
  await writeRegistry(reg);
  return { entry };
}

export async function abortUpload(uploadId: string): Promise<void> {
  const reg = await readRegistry();
  const entry = findEntry(reg, uploadId);
  if (!entry) return;
  entry.status = "aborted";
  await writeRegistry(reg);
  await unlink(partPath(entry)).catch(() => undefined);
}

export async function deleteUpload(name: string): Promise<boolean> {
  const reg = await readRegistry();
  const matches = reg.uploads.filter((u) => u.name === name || u.safeName === name);
  if (!matches.length) return false;
  reg.uploads = reg.uploads.filter((u) => !matches.includes(u));
  await writeRegistry(reg);
  for (const entry of matches) {
    await unlink(partPath(entry)).catch(() => undefined);
  }
  return true;
}

/** Registry view for the Files panel (no file bodies). */
export async function listUploads(): Promise<
  { name: string; bytes: number; mime: string; language: string; updatedAt: string; kind: "upload"; textLike: boolean }[]
> {
  const reg = await readRegistry();
  return reg.uploads
    .filter((u) => u.status === "complete")
    .map((u) => ({
      name: u.name,
      bytes: u.bytes,
      mime: u.mime,
      language: guessUploadLanguage(u.name),
      updatedAt: u.updatedAt,
      kind: "upload" as const,
      textLike: isTextLike(u.name, u.mime),
    }));
}

export async function uploadPathFor(name: string): Promise<string | null> {
  const reg = await readRegistry();
  const entry = reg.uploads.find((u) => (u.name === name || u.safeName === name) && u.status === "complete");
  if (!entry) return null;
  const p = partPath(entry);
  return existsSync(p) ? p : null;
}

/** Head of a text upload, for read_file / the Files panel "Open" button. */
export async function readUploadHead(
  name: string,
  maxChars = 200_000,
): Promise<{ name: string; mime: string; bytes: number; truncated: boolean; text: string } | null> {
  const p = await uploadPathFor(name);
  if (!p) return null;
  const reg = await readRegistry();
  const entry = reg.uploads.find((u) => (u.name === name || u.safeName === name) && u.status === "complete");
  if (!entry) return null;
  const handle = await import("node:fs/promises").then((m) => m.open(p, "r"));
  try {
    const buf = Buffer.alloc(Math.min(maxChars * 4, 1_048_576));
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    const text = buf.subarray(0, bytesRead).toString("utf8").slice(0, maxChars);
    return {
      name: entry.name,
      mime: entry.mime,
      bytes: entry.bytes,
      truncated: entry.bytes > Buffer.byteLength(text, "utf8"),
      text,
    };
  } finally {
    await handle.close();
  }
}

/** Prune stale "uploading" entries older than a day (interrupted uploads). */
export async function pruneStaleUploads(): Promise<void> {
  const reg = await readRegistry();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let changed = false;
  for (const u of reg.uploads) {
    if (u.status === "uploading" && Date.parse(u.updatedAt) < cutoff) {
      u.status = "aborted";
      changed = true;
      await unlink(partPath(u)).catch(() => undefined);
    }
  }
  if (changed) await writeRegistry(reg);
}

function guessUploadLanguage(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    html: "html",
    htm: "html",
    js: "javascript",
    mjs: "javascript",
    ts: "typescript",
    css: "css",
    json: "json",
    md: "markdown",
    csv: "csv",
    tsv: "csv",
    svg: "svg",
    py: "python",
    txt: "text",
    yaml: "yaml",
    yml: "yaml",
    log: "text",
  };
  return map[ext] || "binary";
}

/** Used by the sandbox self-scan report: number of bytes on disk. */
export async function uploadsDiskUsage(): Promise<number> {
  try {
    const files = await readdir(UPLOAD_DIR);
    let total = 0;
    for (const f of files) {
      if (f === "registry.json") continue;
      const st = await stat(join(UPLOAD_DIR, f)).catch(() => null);
      if (st?.isFile()) total += st.size;
    }
    return total;
  } catch {
    return 0;
  }
}
