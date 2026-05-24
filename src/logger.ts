import pino from "pino";
import path from "node:path";
import { configDir } from "./config";
import { scrubPII } from "./scrub-pii";

/**
 * Camada 6: log só de metadados. `formatters.log` roda no processo principal
 * (antes do transport) e passa o OBJETO DE MERGE ESTRUTURADO (os campos
 * passados como primeiro argumento de `logger.info(obj, msg)`) pelo scrubPII.
 *
 * IMPORTANTE — convenção obrigatória: o `formatters.log` do pino recebe APENAS
 * o objeto de merge, NÃO a string de mensagem (`msg`). A mensagem NÃO passa
 * pelo scrubber. Portanto, quem chama o logger DEVE passar PII como campos
 * (objeto de merge) — ex.: `logger.warn({ err }, "falhou")` — e NUNCA
 * interpolar PII na string da mensagem (ex.: `logger.warn(\`falhou: ${err}\`)`),
 * pois esse texto livre escaparia da redação.
 *
 * Arquivos rotacionam por dia, retenção 14 cópias (pino-roll).
 */
export const redactLog = (obj: Record<string, unknown>): Record<string, unknown> => scrubPII(obj);

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    log: redactLog,
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
