import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { registerPrintRoute } from "../src/routes/print";
import { FakePrinterDriver } from "../src/printer-driver";
import { makeRequireAuth } from "../src/auth-hook";
import { receiptFingerprint } from "../src/print-job";

const TOKEN = "a".repeat(64);
const validReceipt = {
  saleNumber: "VEN-00001",
  createdAt: "2026-05-24T12:00:00.000Z",
  branch: { name: "Loja", address: "R", city: "C", state: "GO", phone: "x" },
  items: [{ description: "i", quantity: 1, unitPrice: 1, subtotal: 1 }],
  subtotal: 1, discount: 0, total: 1,
  payment: { method: "DINHEIRO" },
  footerMessage: "ok", reprint: false,
};

let app: FastifyInstance;
let printer: FakePrinterDriver;

beforeEach(async () => {
  printer = new FakePrinterDriver();
  app = Fastify();
  registerPrintRoute(app, { printer, requireAuth: makeRequireAuth(() => TOKEN) });
  await app.ready();
});

describe("POST /print", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "POST", url: "/print", payload: { receipt: validReceipt } });
    expect(res.statusCode).toBe(401);
  });

  it("400 com payload invalido", async () => {
    const res = await app.inject({ method: "POST", url: "/print", headers: { authorization: `Bearer ${TOKEN}` }, payload: { receipt: { foo: 1 } } });
    expect(res.statusCode).toBe(400);
  });

  it("503 quando impressora offline", async () => {
    printer.connected = false;
    const res = await app.inject({ method: "POST", url: "/print", headers: { authorization: `Bearer ${TOKEN}` }, payload: { receipt: validReceipt } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("PRINTER_OFFLINE");
  });

  it("200 e imprime no caminho feliz", async () => {
    const res = await app.inject({ method: "POST", url: "/print", headers: { authorization: `Bearer ${TOKEN}` }, payload: { receipt: validReceipt } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(printer.printed).toHaveLength(1);
  });

  it("503 quando a impressao lanca", async () => {
    printer.shouldThrow = true;
    const res = await app.inject({ method: "POST", url: "/print", headers: { authorization: `Bearer ${TOKEN}` }, payload: { receipt: validReceipt } });
    expect(res.statusCode).toBe(503);
  });
});

/**
 * Print job atravessando a ROTA (não só o verificador): é aqui que se prova que
 * o Axis imprime sem nunca receber o `config.token`, e que o job não serve pra
 * reimprimir nem pra imprimir outra coisa.
 */
describe("POST /print com print job assinado", () => {
  const job = (over: Record<string, unknown> = {}, receipt: unknown = validReceipt) => {
    const nowS = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(
      JSON.stringify({
        typ: "axis-print-job",
        jti: crypto.randomBytes(8).toString("hex"),
        iat: nowS,
        exp: nowS + 60,
        sub: receiptFingerprint(receipt),
        ...over,
      }),
    ).toString("base64url");
    const s = crypto.createHmac("sha256", TOKEN).update(`${h}.${p}`).digest("base64url");
    return `${h}.${p}.${s}`;
  };

  const post = (auth: string, receipt: unknown = validReceipt) =>
    app.inject({
      method: "POST",
      url: "/print",
      headers: { authorization: `Bearer ${auth}` },
      payload: { receipt },
    });

  it("imprime com job valido — sem o token estatico sair do servidor", async () => {
    const res = await post(job());
    expect(res.statusCode).toBe(200);
    expect(printer.printed).toHaveLength(1);
  });

  it("recusa o mesmo job duas vezes (nao vira reimpressao)", async () => {
    const t = job();
    expect((await post(t)).statusCode).toBe(200);
    expect((await post(t)).statusCode).toBe(401);
    expect(printer.printed).toHaveLength(1);
  });

  it("recusa job de um cupom para imprimir OUTRO", async () => {
    const t = job(); // assinado sobre validReceipt
    const outro = { ...validReceipt, saleNumber: "VEN-00999", total: 999 };
    const res = await post(t, outro);
    expect(res.statusCode).toBe(401);
    expect(printer.printed).toHaveLength(0);
  });

  it("recusa job expirado", async () => {
    const nowS = Math.floor(Date.now() / 1000);
    expect((await post(job({ iat: nowS - 600, exp: nowS - 300 }))).statusCode).toBe(401);
  });

  it("nao revela o motivo da recusa na resposta (sem oraculo)", async () => {
    const res = await post(job({ typ: "outro" }));
    expect(res.json()).toEqual({ ok: false, error: "UNAUTHORIZED" });
  });

  it("token estatico continua valendo (caixa nao migrado)", async () => {
    expect((await post(TOKEN)).statusCode).toBe(200);
  });
});

/** Cupom de senha (v1.3): mesma rota, mesmo envelope assinado, `sub` sobre `body.ticket`. */
describe("POST /print com { ticket }", () => {
  const ticket = { number: 12, issuedAt: "2026-09-14T13:05:00.000Z", branchName: "São Roque" };

  const job = (subject: unknown) => {
    const nowS = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(
      JSON.stringify({ typ: "axis-print-job", jti: crypto.randomBytes(8).toString("hex"), iat: nowS, exp: nowS + 60, sub: receiptFingerprint(subject) }),
    ).toString("base64url");
    const s = crypto.createHmac("sha256", TOKEN).update(`${h}.${p}`).digest("base64url");
    return `${h}.${p}.${s}`;
  };

  const post = (auth: string, payload: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/print", headers: { authorization: `Bearer ${auth}` }, payload });

  it("200 e imprime a senha com job assinado sobre o ticket", async () => {
    const res = await post(job(ticket), { ticket });
    expect(res.statusCode).toBe(200);
    expect(printer.printedTickets).toEqual([ticket]);
    expect(printer.printed).toHaveLength(0);
  });

  it("401 com { ticket, receipt } no mesmo body — job sobre o ticket NAO imprime o receipt (DANFE forjado)", async () => {
    const ticket = { kind: "senha", number: "A001", createdAt: "2026-05-24T12:00:00.000Z", branch: { name: "Loja" } };
    const res = await app.inject({
      method: "POST",
      url: "/print",
      headers: { authorization: `Bearer ${job(ticket)}` },
      payload: { ticket, receipt: { ...validReceipt, fiscal: { chaveAcesso: "1".repeat(44), qrCode: "https://x", numero: "1", serie: "1" } } },
    });
    expect(res.statusCode).toBe(401);
    expect(printer.printed).toHaveLength(0);
  });

  it("401 quando o job foi assinado sobre { receipt } e o body e { ticket }", async () => {
    const res = await post(job(validReceipt), { ticket });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(printer.printedTickets).toHaveLength(0);
  });

  it("400 INVALID_PAYLOAD com ticket fora do contrato", async () => {
    for (const bad of [{ ...ticket, number: 0 }, { ...ticket, branchName: "x".repeat(81) }]) {
      const res = await post(TOKEN, { ticket: bad });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("INVALID_PAYLOAD");
    }
    expect(printer.printedTickets).toHaveLength(0);
  });
});
