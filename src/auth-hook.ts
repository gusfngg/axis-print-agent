import type { FastifyReply, FastifyRequest } from "fastify";
import { extractBearer, tokenMatches } from "./auth";

/** Fábrica de preHandler que exige Bearer válido. `getToken` lê o token atual da config. */
export function makeRequireAuth(getToken: () => string) {
  return async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    const provided = extractBearer(req.headers.authorization);
    if (!provided || !tokenMatches(provided, getToken())) {
      return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
    }
  };
}

export type RequireAuth = ReturnType<typeof makeRequireAuth>;
