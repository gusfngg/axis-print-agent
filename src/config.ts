import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

export function configDir(): string {
  if (process.env.AXIS_PRINT_CONFIG_DIR) return process.env.AXIS_PRINT_CONFIG_DIR;
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? os.homedir(), "axis-print");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "axis-print");
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "axis-print");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function loadOrInitConfig(): AgentConfig {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = configPath();
  if (!fs.existsSync(file)) {
    const seed = ConfigSchema.parse({
      token: crypto.randomBytes(32).toString("hex"),
      printerName: "auto",
    });
    fs.writeFileSync(file, JSON.stringify(seed, null, 2), { mode: 0o600 });
    return seed;
  }
  return ConfigSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}
