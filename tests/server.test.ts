import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server";
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
