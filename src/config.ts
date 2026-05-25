import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
// IMPORTANTE: ciclo de import. NAO importe `logger` no topo. Use import dinamico
// dentro de loadOrInitConfig (abaixo) pra quebrar o ciclo config<->logger.

export const ConfigSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  printerName: z.string().min(1),
  printerType: z.enum(["EPSON", "STAR", "TANCA", "DARUMA", "BROTHER"]).default("EPSON"),
  characterSet: z.string().default("PC860_PORTUGUESE"),
  allowedOrigins: z
    .array(z.string().url())
    .default(["https://axis-erp.vercel.app", "http://localhost:3000"]),
});
export type AgentConfig = z.infer<typeof ConfigSchema>;

// Sinaliza se o ultimo loadOrInitConfig precisou regenerar um config invalido
// (self-heal). Lido pelo /health via wasConfigSelfHealed().
let _selfHealed = false;
export function wasConfigSelfHealed(): boolean { return _selfHealed; }

export function configDir(): string {
  if (process.env.AXIS_PRINT_CONFIG_DIR) return process.env.AXIS_PRINT_CONFIG_DIR;
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? os.homedir(), "axis-print");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "axis-print");
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "axis-print");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

function generateSeed(): AgentConfig {
  return ConfigSchema.parse({ token: crypto.randomBytes(32).toString("hex"), printerName: "auto" });
}

function writeConfig(cfg: AgentConfig): void {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
  lockdownConfigFile();
}

/** Persiste mudancas (ex: printerName setado via /config). */
export function saveConfig(cfg: AgentConfig): void {
  writeConfig(ConfigSchema.parse(cfg));
}

/** Windows: restringe a ACL do config.json ao usuario atual (POSIX 0600 nao vale em NTFS). No-op fora. */
export function lockdownConfigFile(): void {
  if (process.platform !== "win32") return;
  try {
    const user = process.env.USERNAME;
    if (!user) return;
    execFileSync("icacls", [configPath(), "/inheritance:r", "/grant:r", `${user}:F`], { stdio: "ignore" });
  } catch {
    /* best-effort; ausencia de ACL nao deve impedir o boot */
  }
}

export function loadOrInitConfig(): AgentConfig {
  _selfHealed = false; // reset por load
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = configPath();
  if (!fs.existsSync(file)) {
    const seed = generateSeed();
    writeConfig(seed);
    return seed;
  }
  try {
    return ConfigSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (err) {
    _selfHealed = true;
    const backup = `${file}.bak.${Date.now()}`;
    try { fs.renameSync(file, backup); } catch { /* se nem renomear der, sobrescreve */ }
    const seed = generateSeed();
    writeConfig(seed);
    // log via import dinamico pra evitar ciclo no topo do modulo:
    void import("./logger.js").then(({ logger }) =>
      logger.warn({ err: (err as Error).message, backup }, "config invalido — backup feito e regenerado (re-pareamento necessario)"),
    ).catch(() => { /* logger indisponivel: silencioso */ });
    return seed;
  }
}
