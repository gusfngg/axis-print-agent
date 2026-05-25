import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildServer } from "../src/server";
import { FakePrinterDriver } from "../src/printer-driver";
import type { AgentConfig } from "../src/config";

const TOKEN = "c".repeat(64);
const HOST = "127.0.0.1:9101";
let dir: string;
let cfg: AgentConfig;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "axis-cfg-route-"));
  process.env.AXIS_PRINT_CONFIG_DIR = dir;
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({
    token: TOKEN, printerName: "auto", printerType: "EPSON", characterSet: "PC860_PORTUGUESE",
    allowedOrigins: ["https://axis-erp.vercel.app"],
  }, null, 2));
  cfg = { token: TOKEN, printerName: "auto", printerType: "EPSON", characterSet: "PC860_PORTUGUESE", allowedOrigins: ["https://axis-erp.vercel.app"] };
});
afterEach(() => { delete process.env.AXIS_PRINT_CONFIG_DIR; fs.rmSync(dir, { recursive: true, force: true }); });

describe("POST /config", () => {
  it("401 sem Bearer", async () => {
    const app = buildServer({ config: cfg, printer: new FakePrinterDriver() });
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/config", headers: { host: HOST }, payload: { printerName: "X" } });
    expect(res.statusCode).toBe(401);
  });
  it("400 payload invalido", async () => {
    const app = buildServer({ config: cfg, printer: new FakePrinterDriver() });
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/config", headers: { host: HOST, authorization: `Bearer ${TOKEN}` }, payload: { printerName: "" } });
    expect(res.statusCode).toBe(400);
  });
  it("200 seta printerName, atualiza memoria e persiste", async () => {
    const app = buildServer({ config: cfg, printer: new FakePrinterDriver() });
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/config", headers: { host: HOST, authorization: `Bearer ${TOKEN}` }, payload: { printerName: "EPSON-TM-T20" } });
    expect(res.statusCode).toBe(200);
    expect(cfg.printerName).toBe("EPSON-TM-T20"); // memoria
    expect(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).printerName).toBe("EPSON-TM-T20"); // disco
  });
});
