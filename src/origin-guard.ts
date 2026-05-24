import type { FastifyReply, FastifyRequest } from "fastify";
import { ALLOWED_HOSTS } from "./constants";

function hostAllowed(host: string | undefined): boolean {
  return !!host && (ALLOWED_HOSTS as readonly string[]).includes(host);
}

/**
 * Camada 2. Hook onRequest:
 *  - valida o header Host (anti DNS-rebinding);
 *  - valida a Origin contra a allow-list (quando presente);
 *  - ecoa o CORS só pra origem permitida;
 *  - responde o preflight OPTIONS incluindo Private Network Access.
 * Origin ausente é permitida só pra prosseguir (clientes não-browser como curl
 * continuam barrados pelo Bearer nas rotas /print e /printers).
 */
export function makeOriginGuard(allowedOrigins: string[]) {
  return async function originGuard(req: FastifyRequest, reply: FastifyReply) {
    if (!hostAllowed(req.headers.host)) {
      return reply.code(403).send({ ok: false, error: "ORIGIN_FORBIDDEN" });
    }

    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!allowedOrigins.includes(origin)) {
        return reply.code(403).send({ ok: false, error: "ORIGIN_FORBIDDEN" });
      }
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
      reply.header("access-control-allow-headers", "authorization, content-type");
      reply.header("access-control-max-age", "600");
      if (req.headers["access-control-request-private-network"] === "true") {
        reply.header("access-control-allow-private-network", "true");
      }
      return reply.code(204).send();
    }
  };
}
