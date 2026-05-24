import crypto from "node:crypto";

/** Extrai o token de um header `Authorization: Bearer <token>`. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match ? match[1]! : null;
}

/**
 * Compara dois tokens em tempo constante. Hasheia ambos com SHA-256 (digest de
 * tamanho fixo) antes do timingSafeEqual — evita vazar o comprimento e evita o
 * throw do timingSafeEqual quando os buffers têm tamanhos diferentes.
 */
export function tokenMatches(provided: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
