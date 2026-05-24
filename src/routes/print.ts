import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PrintRequest } from "../receipt-dto";
import type { PrinterDriver } from "../printer-driver";
import type { RequireAuth } from "../auth-hook";

export function registerPrintRoute(
  app: FastifyInstance,
  deps: { printer: PrinterDriver; requireAuth: RequireAuth },
): void {
  app.post("/print", { preHandler: deps.requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = PrintRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "INVALID_PAYLOAD" });

    const started = Date.now();
    try {
      if (!(await deps.printer.isConnected())) {
        return reply.code(503).send({ ok: false, error: "PRINTER_OFFLINE" });
      }
      await deps.printer.printReceipt(parsed.data.receipt);
      const durationMs = Date.now() - started;
      req.log.info({ sale: parsed.data.receipt.saleNumber, durationMs, reprint: parsed.data.receipt.reprint }, "printed");
      return reply.code(200).send({ ok: true, durationMs });
    } catch (err) {
      req.log.error({ err: (err as Error).message }, "print failed");
      return reply.code(503).send({ ok: false, error: "PRINT_FAILED" });
    }
  });
}
