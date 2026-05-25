import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AgentConfig } from "../config";
import { saveConfig } from "../config";
import type { RequireAuth } from "../auth-hook";

const ConfigPatch = z.object({
  printerName: z.string().min(1).max(200),
});

/**
 * POST /config (Bearer): seta a impressora. Muta o config em memoria (que o
 * resto do server le por referencia) e persiste no disco.
 */
export function registerConfigRoute(
  app: FastifyInstance,
  deps: { config: AgentConfig; requireAuth: RequireAuth },
): void {
  app.post("/config", { preHandler: deps.requireAuth }, async (req, reply) => {
    const parsed = ConfigPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "INVALID_PAYLOAD" });
    deps.config.printerName = parsed.data.printerName;
    saveConfig(deps.config);
    return { ok: true, printerName: deps.config.printerName };
  });
}
