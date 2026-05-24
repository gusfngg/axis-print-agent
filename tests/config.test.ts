// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOrInitConfig, ConfigSchema } from "../src/config";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "axis-print-cfg-"));
  process.env.AXIS_PRINT_CONFIG_DIR = dir;
});
afterEach(() => {
  delete process.env.AXIS_PRINT_CONFIG_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("config", () => {
  it("no 1o run gera token 64-hex e persiste", () => {
    const cfg = loadOrInitConfig();
    expect(cfg.token).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(path.join(dir, "config.json"))).toBe(true);
  });

  it("reload retorna o mesmo token", () => {
    const a = loadOrInitConfig();
    const b = loadOrInitConfig();
    expect(b.token).toBe(a.token);
  });

  it("config invalida lanca", () => {
    expect(() => ConfigSchema.parse({ token: "curto", printerName: "x" })).toThrow();
  });

  it("aplica defaults de origem e tipo", () => {
    const cfg = loadOrInitConfig();
    expect(cfg.allowedOrigins).toContain("https://axis-erp.vercel.app");
    expect(cfg.printerType).toBe("EPSON");
  });
});
