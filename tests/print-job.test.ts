// tests/print-job.test.ts
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  MAX_TTL_SECONDS,
  PRINT_JOB_TYP,
  ReplayGuard,
  looksLikePrintJob,
  receiptFingerprint,
  verifyPrintJob,
} from "../src/print-job";

const SECRET = "a".repeat(64);
const NOW_MS = Date.UTC(2026, 7, 6, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

const RECEIPT = { saleNumber: "VEN-00042", total: 10 };

function sign(claims: Record<string, unknown>, secret = SECRET, header = { alg: "HS256", typ: "JWT" }) {
  const h = Buffer.from(JSON.stringify(header)).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

function claims(over: Record<string, unknown> = {}) {
  return {
    typ: PRINT_JOB_TYP,
    jti: crypto.randomBytes(8).toString("hex"),
    iat: NOW_S,
    exp: NOW_S + 60,
    sub: receiptFingerprint(RECEIPT),
    ...over,
  };
}

const verify = (token: string, over: { replay?: ReplayGuard; receipt?: unknown } = {}) =>
  verifyPrintJob(token, SECRET, {
    expectedFingerprint: receiptFingerprint("receipt" in over ? over.receipt : RECEIPT),
    replay: over.replay ?? new ReplayGuard(),
    nowMs: NOW_MS,
  });

describe("print job (Camada 3b)", () => {
  it("aceita um job bem formado e no prazo", () => {
    expect(verify(sign(claims())).ok).toBe(true);
  });

  it("recusa assinatura de outro segredo", () => {
    expect(verify(sign(claims(), "b".repeat(64)))).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("recusa payload adulterado sem re-assinar", () => {
    const token = sign(claims());
    const [h, , s] = token.split(".");
    const forjado = Buffer.from(JSON.stringify(claims({ sub: "0".repeat(64) }))).toString("base64url");
    expect(verify(`${h}.${forjado}.${s}`)).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("recusa job expirado (fora da tolerancia de relogio)", () => {
    expect(verify(sign(claims({ iat: NOW_S - 120, exp: NOW_S - 60 })))).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
  });

  it("tolera deriva pequena de relogio — cliente pago nao fica sem cupom", () => {
    // exp 10s no passado: dentro do skew, ainda imprime.
    expect(verify(sign(claims({ iat: NOW_S - 70, exp: NOW_S - 10 }))).ok).toBe(true);
  });

  it("recusa TTL longo demais — um job eterno recria o problema", () => {
    expect(verify(sign(claims({ exp: NOW_S + MAX_TTL_SECONDS + 60 })))).toEqual({
      ok: false,
      reason: "TTL_TOO_LONG",
    });
  });

  it("recusa job assinado para OUTRO cupom", () => {
    expect(verify(sign(claims()), { receipt: { saleNumber: "VEN-00099", total: 999 } })).toEqual({
      ok: false,
      reason: "PAYLOAD_MISMATCH",
    });
  });

  it("recusa a segunda apresentacao do mesmo jti (replay)", () => {
    const replay = new ReplayGuard();
    const token = sign(claims());
    expect(verify(token, { replay }).ok).toBe(true);
    expect(verify(token, { replay })).toEqual({ ok: false, reason: "REPLAYED" });
  });

  it("nao queima o jti de um job invalido", () => {
    const replay = new ReplayGuard();
    const c = claims();
    // Primeiro com o cupom errado (falha), depois com o certo: tem que passar.
    expect(verify(sign(c), { replay, receipt: { outro: true } }).ok).toBe(false);
    expect(verify(sign(c), { replay }).ok).toBe(true);
  });

  it("recusa typ de outro proposito (token de sessao do Axis, p.ex.)", () => {
    expect(verify(sign(claims({ typ: "axis-session" })))).toEqual({
      ok: false,
      reason: "WRONG_TYPE",
    });
  });

  it("recusa alg none mesmo com assinatura vazia", () => {
    const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(JSON.stringify(claims())).toString("base64url");
    expect(verify(`${h}.${p}.`).ok).toBe(false);
  });

  it("recusa lixo e formato errado", () => {
    expect(verify("nao-e-um-jws")).toEqual({ ok: false, reason: "MALFORMED" });
    expect(verify("a.b.c")).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("distingue job de token opaco pela forma", () => {
    expect(looksLikePrintJob(sign(claims()))).toBe(true);
    expect(looksLikePrintJob(crypto.randomBytes(32).toString("hex"))).toBe(false);
  });
});

describe("receiptFingerprint", () => {
  it("independe da ordem em que o objeto foi montado", () => {
    expect(receiptFingerprint({ a: 1, b: [2, { c: 3, d: 4 }] })).toBe(
      receiptFingerprint({ b: [2, { d: 4, c: 3 }], a: 1 }),
    );
  });

  it("muda com qualquer alteracao de valor", () => {
    expect(receiptFingerprint({ total: 10 })).not.toBe(receiptFingerprint({ total: 10.01 }));
  });

  it("ignora chave com undefined (some no JSON dos dois lados)", () => {
    expect(receiptFingerprint({ a: 1, b: undefined })).toBe(receiptFingerprint({ a: 1 }));
  });
});

describe("ReplayGuard", () => {
  it("varre entradas vencidas em vez de crescer pra sempre", () => {
    const g = new ReplayGuard();
    g.claim("antigo", NOW_S + 10, NOW_MS);
    expect(g.size).toBe(1);
    // 1 min depois: o vencido sai na proxima insercao.
    g.claim("novo", NOW_S + 120, NOW_MS + 60_000);
    expect(g.size).toBe(1);
  });
});
