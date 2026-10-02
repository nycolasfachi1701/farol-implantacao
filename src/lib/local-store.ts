import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Subconjunto da API do cliente Upstash Redis usado pela camada de dados.
 * Tanto o cliente real quanto o fallback local satisfazem este contrato.
 */
export interface DbClient {
  hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>;
  hset(key: string, kv: Record<string, unknown>): Promise<number>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

type Counter = { v: number; exp: number };
type DbShape = Record<string, Record<string, unknown>>;
const COUNTERS = "__counters";

/** Arquivo JSON usado como banco em desenvolvimento (sem Upstash). */
const FILE = path.join(process.cwd(), ".data", "farol.json");

async function readDb(): Promise<DbShape> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as DbShape;
  } catch {
    return {};
  }
}

async function writeDb(db: DbShape): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2), "utf8");
}

/**
 * Fallback persistido em arquivo que imita os comandos de hash do Redis.
 * Destinado apenas ao desenvolvimento local — em produção, use Upstash/Vercel KV.
 */
export const localStore: DbClient = {
  async hgetall<T extends Record<string, unknown>>(key: string) {
    const h = (await readDb())[key];
    return h && Object.keys(h).length ? (h as T) : null;
  },

  async hset(key, kv) {
    const db = await readDb();
    const h = db[key] || (db[key] = {});
    let added = 0;
    for (const [field, value] of Object.entries(kv)) {
      if (!(field in h)) added++;
      h[field] = value;
    }
    await writeDb(db);
    return added;
  },

  async hget<T>(key: string, field: string) {
    const value = (await readDb())[key]?.[field];
    return value === undefined ? null : (value as T);
  },

  async hdel(key, ...fields) {
    const db = await readDb();
    const h = db[key];
    if (!h) return 0;
    let removed = 0;
    for (const field of fields) {
      if (field in h) {
        delete h[field];
        removed++;
      }
    }
    await writeDb(db);
    return removed;
  },

  // Contadores com expiração — usados pelo rate limiting em desenvolvimento.
  async incr(key) {
    const db = await readDb();
    const c = (db[COUNTERS] || (db[COUNTERS] = {})) as Record<string, Counter>;
    const now = Date.now();
    const cur = c[key];
    const base = !cur || (cur.exp && cur.exp < now) ? { v: 0, exp: 0 } : cur;
    base.v += 1;
    c[key] = base;
    await writeDb(db);
    return base.v;
  },

  async expire(key, seconds) {
    const db = await readDb();
    const c = (db[COUNTERS] || (db[COUNTERS] = {})) as Record<string, Counter>;
    if (!c[key]) return 0;
    c[key].exp = Date.now() + seconds * 1000;
    await writeDb(db);
    return 1;
  },
};
