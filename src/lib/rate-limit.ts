import { redis, isConfigured } from "./redis";

/**
 * Rate limiting de janela fixa. Retorna `true` se a ação é permitida.
 * Usa Upstash em produção (compartilhado entre instâncias) e o store local em dev.
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  if (!isConfigured) return true; // sem backend, não limita (dev sem store)
  const k = `rl:${key}`;
  try {
    const count = await redis.incr(k);
    if (count === 1) await redis.expire(k, windowSec);
    return count <= max;
  } catch {
    // Falha no backend não deve derrubar o login — não bloqueia.
    return true;
  }
}
