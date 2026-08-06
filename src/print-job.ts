import crypto from "node:crypto";

/**
 * Camada 3b — **print job assinado** (fecha o achado ALTO da revisão
 * axis-security de 2026-07-31).
 *
 * O problema: pra imprimir, o browser precisa provar identidade ao agente, e a
 * única prova que existia era o `config.token` — segredo de LONGA duração que o
 * Axis tinha que entregar ao JavaScript. Um XSS, uma extensão ou um DevTools
 * aberto no totem levava o token embora, e ele vale até o re-pareamento.
 *
 * A correção: o Axis não entrega mais o segredo, entrega um **JWS de 60s
 * assinado com ele** (HS256). O agente valida assinatura + expiração + replay.
 * O segredo fica só nas duas pontas de servidor — nunca no browser.
 *
 * `sub` prende o job AO CUPOM (hash do corpo). Sem isso, um job capturado em
 * voo imprimiria qualquer coisa até expirar; com isso ele só reimprimiria
 * exatamente o mesmo papel — e o `jti` mata até essa repetição.
 *
 * Sem lib de JWT de propósito: são 3 campos e um HMAC, e `node:crypto` já está
 * no bundle. Uma dependência a mais dentro do `.exe` do pkg é risco de supply
 * chain que este arquivo não justifica.
 */

export const PRINT_JOB_TYP = "axis-print-job";

/** Teto de validade aceito, independente do que o emissor pediu. Um `exp` longo
 *  demais recria exatamente o problema que o job veio resolver. */
export const MAX_TTL_SECONDS = 300;

/** Tolerância de relógio. O totem e a Vercel não compartilham NTP, e recusar por
 *  2s de deriva significa cliente que pagou e ficou sem cupom. */
const CLOCK_SKEW_SECONDS = 30;

export interface PrintJobClaims {
  typ: string;
  jti: string;
  iat: number;
  exp: number;
  /** SHA-256 (hex) do cupom canônico — ver `receiptFingerprint`. */
  sub: string;
}

export type PrintJobFailure =
  | "MALFORMED"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "TTL_TOO_LONG"
  | "WRONG_TYPE"
  | "PAYLOAD_MISMATCH"
  | "REPLAYED";

export type PrintJobResult =
  | { ok: true; claims: PrintJobClaims }
  | { ok: false; reason: PrintJobFailure };

function b64urlDecode(part: string): Buffer {
  return Buffer.from(part, "base64url");
}

/**
 * Impressão digital do cupom, com as chaves ORDENADAS: os dois lados precisam
 * chegar ao mesmo byte, e a ordem de chave de um objeto JS depende de como ele
 * foi construído — a mesma nota daria hashes diferentes com `JSON.stringify`
 * cru.
 */
export function receiptFingerprint(receipt: unknown): string {
  return crypto.createHash("sha256").update(canonicalize(receipt)).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    // `undefined` some no JSON dos dois lados; incluí-lo aqui divergiria o hash.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

/**
 * Cache de `jti` já usados. `Map` em memória basta: o agente é single-instance
 * (ver `single-instance.ts`) e um restart só perde a janela de 5min — o `exp`
 * fecha a porta de qualquer jeito. Entradas vencidas são varridas na inserção,
 * então não há timer nem vazamento.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();

  /** `true` se o `jti` é inédito (e o registra). `false` se já foi usado. */
  claim(jti: string, expEpochSeconds: number, nowMs = Date.now()): boolean {
    for (const [k, exp] of this.seen) if (exp * 1000 <= nowMs) this.seen.delete(k);
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expEpochSeconds);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}

/**
 * Valida o JWS. `expectedFingerprint` amarra o job ao corpo da requisição;
 * `replay` recusa a segunda apresentação do mesmo `jti`.
 */
export function verifyPrintJob(
  compact: string,
  secret: string,
  opts: { expectedFingerprint: string; replay: ReplayGuard; nowMs?: number },
): PrintJobResult {
  const now = opts.nowMs ?? Date.now();
  const parts = compact.split(".");
  if (parts.length !== 3) return { ok: false, reason: "MALFORMED" };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  // Assinatura ANTES de olhar o conteúdo: nada de decidir com base em payload
  // que ainda não se provou autêntico.
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const provided = b64urlDecode(sigB64);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }

  let header: { alg?: string };
  let claims: PrintJobClaims;
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString("utf8"));
    claims = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }

  // `alg` fixo: aceitar o que o header pedir é a porta do ataque `alg: none`.
  // (Aqui já passou pelo HMAC, mas a checagem impede que uma versão futura
  // relaxe isso sem perceber.)
  if (header.alg !== "HS256") return { ok: false, reason: "MALFORMED" };
  if (claims.typ !== PRINT_JOB_TYP) return { ok: false, reason: "WRONG_TYPE" };
  if (typeof claims.exp !== "number" || typeof claims.iat !== "number") {
    return { ok: false, reason: "MALFORMED" };
  }
  if (typeof claims.jti !== "string" || claims.jti.length < 16) {
    return { ok: false, reason: "MALFORMED" };
  }

  const nowSec = Math.floor(now / 1000);
  if (claims.exp + CLOCK_SKEW_SECONDS < nowSec) return { ok: false, reason: "EXPIRED" };
  if (claims.exp - claims.iat > MAX_TTL_SECONDS) return { ok: false, reason: "TTL_TOO_LONG" };

  // Fingerprint também em tempo constante — é derivado do corpo, mas custa o
  // mesmo fazer certo.
  const a = Buffer.from(claims.sub ?? "", "utf8");
  const b = Buffer.from(opts.expectedFingerprint, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "PAYLOAD_MISMATCH" };
  }

  // Replay por ÚLTIMO: só queima o `jti` de um job que já provou ser válido.
  if (!opts.replay.claim(claims.jti, claims.exp, now)) {
    return { ok: false, reason: "REPLAYED" };
  }

  return { ok: true, claims };
}

/** Um JWS tem 3 partes separadas por ponto; o token opaco (64 hex) não tem nenhuma. */
export function looksLikePrintJob(value: string): boolean {
  return value.split(".").length === 3;
}
