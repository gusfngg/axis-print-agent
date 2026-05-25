import pino, { type Logger } from "pino";
import path from "node:path";
import { createStream } from "rotating-file-stream";
import { configDir } from "./config";
import { scrubPII } from "./scrub-pii";

/**
 * Camada 6: o pino `formatters.log` roda no processo principal e scrubeia os
 * CAMPOS do merge object. A string de msg NAO passa pelo scrub — PII vai sempre
 * como campo. Sem `transport`/worker thread (incompativel com pkg): escrevemos
 * direto num stream de rotacao (rotating-file-stream, puro JS).
 */
export const redactLog = (obj: Record<string, unknown>) => scrubPII(obj);

/** Cria um logger pino sobre um destino arbitrario (testavel com stream em memoria). */
export function createLogger(dest: NodeJS.WritableStream): Logger {
  dest.on?.("error", () => {
    /* nunca derruba o agente por falha de log */
  });
  return pino({ level: process.env.LOG_LEVEL ?? "info", formatters: { log: redactLog } }, dest);
}

/** Destino de producao: arquivo rotacionado por dia, teto 20MB/arquivo, 14 arquivos. Fallback stderr. */
function productionDestination(): NodeJS.WritableStream {
  try {
    const stream = createStream("agent.log", {
      path: path.join(configDir(), "logs"),
      size: "20M",
      maxFiles: 14,
      interval: "1d",
      intervalBoundary: true,
    });
    // `createStream` nao lanca sincrono em disco cheio/sem permissao — falhas de
    // fs chegam como evento 'error' assincrono. O listener no-op de `createLogger`
    // evita o crash mas engole o erro em silencio. Aqui sinalizamos UMA vez ao
    // stderr para o operador (agente roda sem supervisao na maquina da loja).
    let signaled = false;
    stream.on("error", () => {
      if (signaled) return;
      signaled = true;
      try {
        process.stderr.write("axis-print-agent: file logging failed — logs degraded\n");
      } catch {
        /* stderr indisponivel: nada mais a fazer */
      }
    });
    return stream;
  } catch {
    return process.stderr;
  }
}

export const logger = createLogger(productionDestination());
