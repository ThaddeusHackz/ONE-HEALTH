import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { adminEmail, adminName, adminPassword } from "./env";
import { DEFAULT_CONTENT, DEFAULT_KNOWLEDGE, DEFAULT_NAV, type NavItem, type SiteContent } from "./cms";
import { appendEvent } from "./archive";
import { loadPgSnapshot, savePgSnapshot } from "./pg-store";
import type { ActivityRow, AuditRow, ChatRow, DocumentRow, ForecastRow, KnowledgeItem, OfficialSeries } from "./records";

export type { ActivityRow, AuditRow, ChatRow, DocumentRow, ForecastRow, KnowledgeItem, OfficialSeries } from "./records";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  salt: string;
  passwordHash: string;
}

export interface Database {
  content: SiteContent;
  nav: NavItem[];
  knowledge: KnowledgeItem[];
  documents: DocumentRow[];
  chats: ChatRow[];
  forecasts: ForecastRow[];
  officialSeries: OfficialSeries[];
  audits: AuditRow[];
  activity: ActivityRow[];
  admins: AdminUser[];
}

const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "db.json");

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, salt: string, expected: string) {
  const got = Buffer.from(hashPassword(password, salt), "hex");
  const exp = Buffer.from(expected, "hex");
  if (got.length !== exp.length) return false;
  return timingSafeEqual(got, exp);
}

function seedAdmin(): AdminUser {
  const salt = randomBytes(16).toString("hex");
  return {
    id: "admin-root",
    email: adminEmail(),
    name: adminName(),
    salt,
    passwordHash: hashPassword(adminPassword(), salt),
  };
}

function emptyDb(): Database {
  return {
    content: { ...DEFAULT_CONTENT },
    nav: DEFAULT_NAV.map((n) => ({ ...n })),
    knowledge: DEFAULT_KNOWLEDGE.map((k) => ({ ...k })),
    documents: [],
    chats: [],
    forecasts: [],
    officialSeries: [],
    audits: [],
    activity: [],
    admins: [seedAdmin()],
  };
}

let cache: Database | null = null;

function load(): Database {
  if (cache) return cache;
  try {
    if (existsSync(DB_PATH)) {
      const raw = JSON.parse(readFileSync(DB_PATH, "utf8")) as Database;
      cache = {
        ...emptyDb(),
        ...raw,
        content: { ...DEFAULT_CONTENT, ...(raw.content || {}) },
        nav: mergeNav(raw.nav),
        officialSeries: raw.officialSeries || [],
        audits: raw.audits || [],
        admins: raw.admins?.length ? raw.admins : [seedAdmin()],
      };
      return cache;
    }
  } catch (err) {
    console.error("[store] load failed", (err as Error).message);
  }
  cache = emptyDb();
  return cache;
}

function mergeNav(existing?: NavItem[]): NavItem[] {
  const have = new Set((existing || []).map((n) => n.href));
  const extra = DEFAULT_NAV.filter((n) => !have.has(n.href));
  return [...(existing || DEFAULT_NAV.map((n) => ({ ...n }))), ...extra];
}

function persist(db: Database) {
  cache = db;
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(db));
  } catch (err) {
    console.error("[store] persist degraded to memory:", (err as Error).message);
  }
  void savePgSnapshot(db as unknown as Record<string, unknown>);
}

export async function hydrateFromPostgres() {
  try {
    if (existsSync(DB_PATH)) return;
    const raw = await loadPgSnapshot();
    if (!raw || typeof raw !== "object") return;
    const body = raw as unknown as Database;
    cache = {
      ...emptyDb(),
      ...body,
      content: { ...DEFAULT_CONTENT, ...(body.content || {}) },
      nav: mergeNav(body.nav),
      officialSeries: body.officialSeries || [],
      audits: body.audits || [],
      admins: body.admins?.length ? body.admins : [seedAdmin()],
    };
    console.info("[store] hydrated snapshot from Postgres");
  } catch (err) {
    console.error("[store] hydrate", (err as Error).message);
  }
}

export function getDB(): Database {
  return load();
}

export function saveDB(mutator: (db: Database) => void, meta?: { type: string; actor: string; payload?: unknown }): Database {
  const db = load();
  mutator(db);
  persist(db);
  if (meta) appendEvent(meta.type, meta.actor, meta.payload ?? {});
  return db;
}

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

export function logActivity(actor: string, action: string, detail = "") {
  saveDB((db) => {
    db.activity.unshift({ id: uid("act"), actor, action, detail, at: new Date().toISOString() });
    db.activity = db.activity.slice(0, 2000);
  }, { type: "activity", actor, payload: { action, detail } });
}

export function publicConfig() {
  const db = load();
  return { content: db.content, nav: db.nav.filter((n) => n.visible), knowledge: db.knowledge };
}

export function findOfficialSeries(diseaseId: string, regionId: string, districtId?: string) {
  const db = load();
  const match = db.officialSeries.find(
    (s) => s.diseaseId === diseaseId && s.regionId === regionId && (districtId ? s.districtId === districtId : !s.districtId),
  );
  return match || db.officialSeries.find((s) => s.diseaseId === diseaseId && s.regionId === regionId) || null;
}

export function recordAudit(row: Omit<AuditRow, "id" | "at">) {
  saveDB((db) => {
    db.audits.unshift({ id: uid("aud"), at: new Date().toISOString(), ...row });
    db.audits = db.audits.slice(0, 5000);
  }, { type: "audit", actor: row.actor, payload: row });
}
