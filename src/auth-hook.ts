import type { FastifyReply, FastifyRequest } from "fastify";
import { extractBearer, tokenMatches } from "./auth";
import {
  looksLikePrintJob,
  receiptFingerprint,
  ReplayGuard,
  verifyPrintJob,
} from "./print-job";

/**
 * Fábrica de preHandler. `getToken` lê o token atual da config — que agora tem
 * DOIS papéis:
 *
 *  1. **bearer estático** (contrato original): a credencial é o próprio token.
 *  2. **chave HMAC** de um print job assinado de curta duração (Camada 3b).
 *
 * As duas são aceitas de propósito. O achado ALTO é sobre o totem — superfície
 * ANÔNIMA, onde entregar segredo de longa duração ao browser é o problema. O
 * caixa (`/vendas/caixa`) exige sessão + `PRINT_ROLES` e segue no modo 1 até
 * migrar; recusá-lo agora pararia a impressão da loja sem fechar risco novo.
 *
 * O job é reconhecido pela FORMA (3 partes separadas por ponto) — o token opaco
 * é 64 hex, sem ponto, então não há ambiguidade. Credencial em forma de job é
 * validada COMO job e nunca cai no ramo do bearer: sem isso, um job expirado
 * seria comparado como se fosse token e o motivo real da recusa se perderia.
 */
export function makeRequireAuth(getToken: () => string, deps?: { replay?: ReplayGuard }) {
  const replay = deps?.replay ?? new ReplayGuard();

  return async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
    const provided = extractBearer(req.headers.authorization);
    if (!provided) {
      return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
    }

    if (looksLikePrintJob(provided)) {
      // O job é assinado sobre o cupom, então o fingerprint sai do corpo. Em
      // `/printers` e `/config` (sem cupom) o hash é o de `undefined` — estável
      // nos dois lados, então o job continua servindo para essas rotas.
      // `command` (/paygo-window): mesmo contrato — o job e assinado sobre o
      // objeto que o browser posta, entao um job de `show:true` nao serve para
      // `show:false`.
      const body = req.body as { receipt?: unknown; ticket?: unknown; command?: unknown } | undefined;
      // O job assina UM objeto e o handler consome UM campo. Com dois campos no
      // body o hash conferia sobre `ticket` e o /print imprimia `receipt` (DANFE
      // forjado) ou o /paygo-window executava `command` sem sessao de manutencao
      // — achado ALTO do axis-security (2026-09-17). Corpo ambiguo = 401.
      const present = (["ticket", "receipt", "command"] as const).filter((k) => body?.[k] !== undefined);
      if (present.length > 1) {
        req.log.warn({ url: req.url, present }, "print job recusado: corpo com mais de um objeto assinavel");
        return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
      }
      const result = verifyPrintJob(provided, getToken(), {
        expectedFingerprint: receiptFingerprint(body?.[present[0] ?? "receipt"]),
        replay,
      });
      if (!result.ok) {
        // O motivo vai pro LOG (diagnóstico de campo: relógio torto vs. token
        // dessincronizado vs. replay), nunca pra resposta — dizer ao chamador
        // *por que* falhou é oráculo.
        req.log.warn({ url: req.url, reason: result.reason }, "print job recusado");
        return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
      }
      return;
    }

    if (!tokenMatches(provided, getToken())) {
      return reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
    }
  };
}

export type RequireAuth = ReturnType<typeof makeRequireAuth>;
