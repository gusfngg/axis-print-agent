import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerPrintRoute } from "../src/routes/print";
import { FakePrinterDriver } from "../src/printer-driver";
import { makeRequireAuth } from "../src/auth-hook";

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
