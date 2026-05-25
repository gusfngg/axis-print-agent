import type { FastifyInstance } from "fastify";
import type { PrinterDriver } from "../printer-driver";
import { AGENT_VERSION, AGENT_BUILD } from "../constants";

/** Sem Bearer (ver "Desvios"): só liveness + status da impressora, sem segredo. */
export function registerHealthRoute(
  app: FastifyInstance,
  deps: { printer: PrinterDriver; printerName: string; configError?: boolean },
): void {
  app.get("/health", async () => {
    const online = await deps.printer.isConnected();
    return {
      ok: true,
      version: AGENT_VERSION,
      build: AGENT_BUILD,
      printer: { name: deps.printerName, online },
      uptimeSec: Math.floor(process.uptime()),
      ...(deps.configError ? { configError: true } : {}),
    };
  });
}
