// tests/config-selfheal.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOrInitConfig, saveConfig, wasConfigSelfHealed } from "../src/config";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "axis-cfg-heal-"));
  process.env.AXIS_PRINT_CONFIG_DIR = dir;
});
afterEach(() => { delete process.env.AXIS_PRINT_CONFIG_DIR; fs.rmSync(dir, { recursive: true, force: true }); });

describe("config self-heal", () => {
  it("config.json corrompido nao lanca: faz backup e regenera", () => {
    fs.writeFileSync(path.join(dir, "config.json"), "{ isso nao e json valido");
    const cfg = loadOrInitConfig();
    expect(cfg.token).toMatch(/^[0-9a-f]{64}$/);
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith("config.json.bak"));
    expect(backups.length).toBe(1);
  });

  it("config schema-invalido (token curto) tambem regenera com backup", () => {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ token: "curto", printerName: "x" }));
    const cfg = loadOrInitConfig();
    expect(cfg.token).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readdirSync(dir).some((f) => f.startsWith("config.json.bak"))).toBe(true);
  });

  it("saveConfig persiste e o reload le de volta", () => {
    const cfg = loadOrInitConfig();
    saveConfig({ ...cfg, printerName: "EPSON-TM-T20" });
    expect(loadOrInitConfig().printerName).toBe("EPSON-TM-T20");
  });

  it("wasConfigSelfHealed() = true apos carregar config corrompido", () => {
    fs.writeFileSync(path.join(dir, "config.json"), "{ isso nao e json valido");
    loadOrInitConfig();
    expect(wasConfigSelfHealed()).toBe(true);
  });

  it("wasConfigSelfHealed() = false apos carregar config valido", () => {
    const cfg = loadOrInitConfig(); // primeiro load gera seed valido
    saveConfig(cfg);
    loadOrInitConfig(); // reload do config valido
    expect(wasConfigSelfHealed()).toBe(false);
  });
});
