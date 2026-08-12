import crypto from "node:crypto";

/**
 * Resume job assinado — fecha o achado ALTO da revisão axis-security de
 * 2026-08-12, espelhando a Camada 3b do print job.
 *
 * O problema: `GET /device-credential` entregava o `resumeSecret` CRU ao
 * browser anônimo do totem — segredo de longa duração que re-loga o device.
 * Um XSS, uma extensão ou um DevTools aberto levava o segredo embora, e ele
 * vale até o re-pareamento. Exatamente o mesmo furo que o print job resolveu
 * para o token de impressão.
 *
 * A correção (mesmo padrão): o segredo NUNCA sai do disco. Ele vira só a chave
 * HMAC de um **JWS de 60s** (HS256) que o agente assina e devolve. O Axis
 * verifica assinatura + expiração com o mesmo segredo (proof-of-possession) —
 * não precisa de material extra, nem de fingerprint (não há cupom a amarrar).
 *
 * Sem lib de JWT de propósito: são 3 campos e um HMAC, e `node:crypto` já está
 * no bundle (mesma razão do print-job.ts). Uma dep a mais dentro do `.exe` do
 * pkg é risco de supply chain que este arquivo não justifica.
 */

export const RESUME_JOB_TYP = "axis-kiosk-resume";

/** Validade do JWS: 60s. Curto o bastante pra que capturá-lo em voo não valha
 *  quase nada; longo o bastante pra sobreviver à deriva de relógio totem↔Vercel. */
const TTL_SECONDS = 60;

/**
 * Assina um resume job compacto (`header.payload.sig`, base64url), idêntico em
 * forma ao `signPrintJob`:
 *  - header  `{ alg: "HS256", typ: "JWT" }`
 *  - claims  `{ typ: RESUME_JOB_TYP, jti: <16 bytes hex>, iat, exp: iat + 60 }`
 *  - sig     `HMAC-SHA256(secret, "header.payload")` em base64url
 */
export function signResumeJob(secret: string, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    typ: RESUME_JOB_TYP,
    jti: crypto.randomBytes(16).toString("hex"),
    iat,
    exp: iat + TTL_SECONDS,
  };
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
