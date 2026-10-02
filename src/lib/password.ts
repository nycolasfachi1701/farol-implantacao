import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEYLEN = 32;

/** Gera um hash salgado no formato `scrypt$<salt>$<hash>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const dk = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt}$${dk.toString("hex")}`;
}

/** Confere uma senha contra um hash previamente gerado (comparação em tempo constante). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = (stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const dk = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return expected.length === dk.length && timingSafeEqual(expected, dk);
}
