import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Writable } from "node:stream";
import { buildServer } from "../src/server";
import { createLogger } from "../src/logger";
import { FakePrinterDriver } from "../src/printer-driver";
import { RATE_LIMIT_MAX } from "../src/constants";
import type { AgentConfig } from "../src/config";

const TOKEN = "b".repeat(64);
const cfg: AgentConfig = {
  token: TOKEN,
  printerName: "FAKE",
  printerType: "EPSON",
  characterSet: "PC860_PORTUGUESE",
  allowedOrigins: ["https://axis-erp.vercel.app", "http://localhost:3000"],
};
const ORIGIN = "https://axis-erp.vercel.app";
const HOST = "127.0.0.1:9101";

let app: FastifyInstance;
beforeEach(async () => {
  app = buildServer({ config: cfg, printer: new FakePrinterDriver() });
  await app.ready();
});

describe("buildServer (stack completa)", () => {
  it("preflight OPTIONS /print responde 204 com CORS+PNA", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/print",
      headers: { host: HOST, origin: ORIGIN, "access-control-request-private-network": "true" },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-private-network"]).toBe("true");
  });

  it("403 quando Host nao e loopback", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: { host: "evil.com" } });
    expect(res.statusCode).toBe(403);
  });

  it("/health responde 200 sem Bearer", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: { host: HOST } });
    expect(res.statusCode).toBe(200);
    expect(res.json().printer.online).toBe(true);
  });

  it("POST /print feliz com origin+token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/print",
      headers: { host: HOST, origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
      payload: { receipt: {
        saleNumber: "VEN-00009", createdAt: "2026-05-24T12:00:00.000Z",
        branch: { name: "L", address: "R", city: "C", state: "GO", phone: "x" },
        items: [{ description: "i", quantity: 1, unitPrice: 1, subtotal: 1 }],
        subtotal: 1, discount: 0, total: 1, payment: { method: "DINHEIRO" },
        footerMessage: "ok", reprint: false,
      } },
    });
    expect(res.statusCode).toBe(200);
  });

  it("413 quando o body excede 32KB", async () => {
    const big = "x".repeat(40 * 1024);
    const res = await app.inject({
      method: "POST", url: "/print",
      headers: { host: HOST, origin: ORIGIN, authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      payload: `{"receipt":"${big}"}`,
    });
    expect(res.statusCode).toBe(413);
  });

  it("429 apos estourar o rate limit", async () => {
    let last = 0;
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) {
      last = (await app.inject({ method: "GET", url: "/health", headers: { host: HOST } })).statusCode;
    }
    expect(last).toBe(429);
  });

  it("/printers exige Bearer", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/printers", headers: { host: HOST, origin: ORIGIN } });
    expect(noAuth.statusCode).toBe(401);
    const withAuth = await app.inject({ method: "GET", url: "/printers", headers: { host: HOST, origin: ORIGIN, authorization: `Bearer ${TOKEN}` } });
    expect(withAuth.statusCode).toBe(200);
  });

  it("403 para Origin nao permitida (antes do auth)", async () => {
    const res = await app.inject({ method: "POST", url: "/print", headers: { host: HOST, origin: "http://evil.com", authorization: `Bearer ${TOKEN}` }, payload: { receipt: {} } });
    expect(res.statusCode).toBe(403);
  });

  it("/health expoe version e build", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: { host: HOST } });
    const body = res.json();
    expect(typeof body.version).toBe("string");
    expect(typeof body.build).toBe("string"); // "dev" em teste
  });

  it("/health SEM configError por padrao (sem flag)", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: { host: HOST } });
    expect(res.json()).not.toHaveProperty("configError");
  });

  it("/health reporta configError:true quando o flag e passado", async () => {
    const healed = buildServer({ config: cfg, printer: new FakePrinterDriver(), configError: true });
    await healed.ready();
    const res = await healed.inject({ method: "GET", url: "/health", headers: { host: HOST } });
    expect(res.json().configError).toBe(true);
  });
});

// Antes destes testes o server subia com `logger: false`: o Fastify injetava um
// req.log NO-OP e TUDO que as rotas logavam sumia -- inclusive "print failed".
// Uma nota que nao saia no caixa nao deixava uma linha sequer no agent.log, e
// agente morto, Origin recusada e impressora offline ficavam indistinguiveis.
describe("observabilidade (o agent.log tem que provar o que aconteceu)", () => {
  const RECEIPT = {
    saleNumber: "VEN-00009",
    createdAt: "2026-05-24T12:00:00.000Z",
    branch: { name: "L", address: "R", city: "C", state: "GO", phone: "x" },
    items: [{ description: "i", quantity: 1, unitPrice: 1, subtotal: 1 }],
    subtotal: 1, discount: 0, total: 1, payment: { method: "DINHEIRO" },
    footerMessage: "ok", reprint: false,
  };

  function withCapturedLog(printer = new FakePrinterDriver()) {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
    });
    const app = buildServer({ config: cfg, printer, loggerInstance: createLogger(stream) });
    const records = (): Array<Record<string, unknown>> =>
      chunks.join("").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    return { app, printer, records };
  }

  it("registra a impressao bem-sucedida (req.log nao pode ser no-op)", async () => {
    const { app, records } = withCapturedLog();
    await app.ready();
    const res = await app.inject({
      method: "POST", url: "/print",
      headers: { host: HOST, origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
      payload: { receipt: RECEIPT },
    });
    expect(res.statusCode).toBe(200);
    const printed = records().find((r) => r.msg === "printed");
    expect(printed).toBeDefined();
    expect(printed!.sale).toBe("VEN-00009");
  });

  it("registra a FALHA de impressao — o rastro que faltava quando a nota nao sai", async () => {
    const printer = new FakePrinterDriver();
    printer.shouldThrow = true;
    const { app, records } = withCapturedLog(printer);
    await app.ready();
    const res = await app.inject({
      method: "POST", url: "/print",
      headers: { host: HOST, origin: ORIGIN, authorization: `Bearer ${TOKEN}` },
      payload: { receipt: RECEIPT },
    });
    expect(res.statusCode).toBe(503);
    expect(records().some((r) => r.msg === "print failed")).toBe(true);
  });

  it("registra 403 de Origin recusada com a origin que veio", async () => {
    const { app, records } = withCapturedLog();
    await app.ready();
    await app.inject({
      method: "POST", url: "/print",
      headers: { host: HOST, origin: "http://evil.invalid", authorization: `Bearer ${TOKEN}` },
      payload: { receipt: RECEIPT },
    });
    const rec = records().find((r) => r.msg === "requisicao recusada");
    expect(rec).toBeDefined();
    expect(rec!.status).toBe(403);
    expect(rec!.origin).toBe("http://evil.invalid");
  });

  it("registra 401 de token invalido", async () => {
    const { app, records } = withCapturedLog();
    await app.ready();
    await app.inject({
      method: "GET", url: "/printers",
      headers: { host: HOST, origin: ORIGIN, authorization: "Bearer errado" },
    });
    const rec = records().find((r) => r.msg === "requisicao recusada");
    expect(rec).toBeDefined();
    expect(rec!.status).toBe(401);
  });

  it("nao loga requisicao normal (o /health e pollado a cada 30s)", async () => {
    const { app, records } = withCapturedLog();
    await app.ready();
    await app.inject({ method: "GET", url: "/health", headers: { host: HOST } });
    expect(records()).toHaveLength(0);
  });
});
