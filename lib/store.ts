import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { adminEmail, adminName, adminPassword } from "./env";
import { DEFAULT_CONTENT, DEFAULT_KNOWLEDGE, DEFAULT_NAV, type NavItem, type SiteContent } from "./cms";
import type { ActivityRow, ChatRow, DocumentRow, ForecastRow, KnowledgeItem } from "./records";

export type { ActivityRow, ChatRow, DocumentRow, ForecastRow, KnowledgeItem } from "./records";

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
        nav: raw.nav?.length ? raw.nav : DEFAULT_NAV.map((n) => ({ ...n })),
        admins: raw.admins?.length ? raw.admins : [seedAdmin()],
      };
      return cache;
    }
  } catch (err) {
    console.error("[store] load failed", (err as Error).message);
  }
  cache = emptyDb();
  persist(cache);
  return cache;
}

function persist(db: Database) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  cache = db;
}

export function getDB(): Database {
  return load();
}

export function saveDB(mutator: (db: Database) => void): Database {
  const db = load();
  mutator(db);
  persist(db);
  return db;
}

export function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

export function logActivity(actor: string, action: string, detail = "") {
  saveDB((db) => {
    db.activity.unshift({ id: uid("act"), actor, action, detail, at: new Date().toISOString() });
    db.activity = db.activity.slice(0, 300);
  });
}

export function publicConfig() {
  const db = load();
  return { content: db.content, nav: db.nav.filter((n) => n.visible), knowledge: db.knowledge };
}
