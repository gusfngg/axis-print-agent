import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PrintRequest } from "../receipt-dto";
import type { PrinterDriver } from "../printer-driver";
import type { RequireAuth } from "../auth-hook";
import { createMutex } from "../mutex";

export function registerPrintRoute(
  app: FastifyInstance,
  deps: { printer: PrinterDriver; requireAuth: RequireAuth },
): void {
  const printLock = createMutex();
  app.post("/print", { preHandler: deps.requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = PrintRequest.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "INVALID_PAYLOAD" });

    const started = Date.now();
    try {
      const result = await printLock(async () => {
        if (!(await deps.printer.isConnected())) {
          return { code: 503 as const, body: { ok: false as const, error: "PRINTER_OFFLINE" } };
        }
        await deps.printer.printReceipt(parsed.data.receipt);
        return { code: 200 as const, body: { ok: true as const, durationMs: Date.now() - started } };
      });
      if (result.code === 200) {
        req.log.info(
          { sale: parsed.data.receipt.saleNumber, durationMs: (result.body as { durationMs: number }).durationMs, reprint: parsed.data.receipt.reprint },
          "printed",
        );
      }
      return reply.code(result.code).send(result.body);
    } catch (err) {
      req.log.error({ err: (err as Error).message }, "print failed");
      return reply.code(503).send({ ok: false, error: "PRINT_FAILED" });
    }
  });
}
