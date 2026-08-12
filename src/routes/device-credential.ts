import type { FastifyInstance } from "fastify";
import type { AgentConfig } from "../config";

/**
 * GET /device-credential — entrega o resume secret ao browser do kiosk (que o
 * troca por uma device session no Axis: POST /api/kiosk/resume).
 *
 * Sem Bearer (chicken-and-egg: o Bearer chega ao browser via rota do Axis que
 * exige a sessão que ainda não existe). Em compensação, Origin é OBRIGATÓRIO e
 * validado — mais estrito que o guard default: rota de segredo não responde a
 * curl/processo local sem Origin.
 */
export function registerDeviceCredentialRoute(
  app: FastifyInstance,
  deps: { config: AgentConfig; allowedOrigins: string[] },
): void {
  app.get("/device-credential", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin === undefined || !deps.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ ok: false, error: "FORBIDDEN_ORIGIN" });
    }
    reply.header("access-control-allow-origin", origin);
    if (!deps.config.resumeSecret) {
      return reply.code(404).send({ ok: false, error: "NOT_CONFIGURED" });
    }
    return { secret: deps.config.resumeSecret };
  });
}
