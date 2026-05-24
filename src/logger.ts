import pino from "pino";
import path from "node:path";
import { configDir } from "./config";
import { scrubPII } from "./scrub-pii";

/**
 * Camada 6: log só de metadados. `formatters.log` roda no processo principal
 * (antes do transport) e passa todo objeto de log pelo scrubPII. Arquivos
 * rotacionam por dia, retenção 14 cópias (pino-roll).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    log: (obj) => scrubPII(obj),
  },
  transport: {
    target: "pino-roll",
    options: {
      file: path.join(configDir(), "logs", "agent.log"),
      frequency: "daily",
      mkdir: true,
      limit: { count: 14 },
    },
  },
});
