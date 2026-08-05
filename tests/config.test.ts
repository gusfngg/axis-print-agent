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

  // Regressao: o deploy real e superauto-totem.vercel.app, mas o default so
  // listava axis-erp.vercel.app. Toda instalacao nova nascia recusando o Axis
  // com 403 na Camada 2 -- e o caixa via o dialogo de impressao do navegador,
  // sintoma identico ao de agente morto. Se sumir daqui, volta a nascer quebrado.
  it("o default aceita a Origin do deploy de producao", () => {
    const cfg = loadOrInitConfig();
    expect(cfg.allowedOrigins).toContain("https://superauto-totem.vercel.app");
  });
});
