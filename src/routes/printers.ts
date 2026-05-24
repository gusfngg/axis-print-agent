import type { FastifyInstance } from "fastify";
import type { PrinterDriver } from "../printer-driver";
import type { RequireAuth } from "../auth-hook";

export function registerPrintersRoute(
  app: FastifyInstance,
  deps: { printer: PrinterDriver; requireAuth: RequireAuth },
): void {
  app.get("/printers", { preHandler: deps.requireAuth }, async () => {
    return { printers: deps.printer.listPrinters() };
  });
}
