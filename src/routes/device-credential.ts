import type { FastifyInstance } from "fastify";
import type { AgentConfig } from "../config";
import { signResumeJob } from "../resume-job";

/**
 * GET /device-credential — entrega um **resume job assinado** (JWS de 60s,
 * proof-of-possession) ao browser do kiosk, que o apresenta ao Axis
 * (POST /api/kiosk/resume) pra reabrir a device session após um reboot.
 *
 * NÃO entrega mais o `resumeSecret` cru (achado ALTO da axis-security de
 * 2026-08-12): o segredo fica só no disco, virando a chave HMAC do JWS. Mesmo
 * um XSS no totem só rouba um token de 60s, não a credencial de longa duração.
 * Ver `resume-job.ts`.
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
    return { job: signResumeJob(deps.config.resumeSecret) };
  });
}
