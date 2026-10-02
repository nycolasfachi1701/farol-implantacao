import { Redis } from "@upstash/redis";
import { localStore, type DbClient } from "./local-store";

const url =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

/** Verdadeiro quando as credenciais do Upstash/Vercel KV estão presentes. */
const hasRedis = Boolean(url && token);

/** Em desenvolvimento, sem Upstash, caímos num banco local em arquivo (.data/farol.json). */
const useLocalFallback = !hasRedis && process.env.NODE_ENV !== "production";

/** Verdadeiro quando há um backend de dados utilizável (Upstash ou fallback local). */
export const isConfigured = hasRedis || useLocalFallback;

/** Cliente de dados. Quando não configurado (produção sem Redis), fica nulo —
 *  por isso toda rota deve checar `isConfigured` antes de usar. */
export const redis: DbClient = hasRedis
  ? (new Redis({ url, token }) as unknown as DbClient)
  : useLocalFallback
    ? localStore
    : (null as unknown as DbClient);

export const KEYS = {
  areas: "farol:areas",
  implantacoes: "farol:implantacoes",
  carteiras: "farol:carteiras",
  users: "farol:users",
} as const;
