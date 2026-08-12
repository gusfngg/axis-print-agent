import Fastify, { type FastifyInstance, type FastifyBaseLogger } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { logger as defaultLogger } from "./logger";
import { MAX_BODY_BYTES, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from "./constants";
import { makeOriginGuard } from "./origin-guard";
import { makeRequireAuth } from "./auth-hook";
import { registerPrintRoute } from "./routes/print";
import { registerHealthRoute } from "./routes/health";
import { registerPrintersRoute } from "./routes/printers";
import { registerConfigRoute } from "./routes/config";
import { registerDeviceCredentialRoute } from "./routes/device-credential";
import type { PrinterDriver } from "./printer-driver";
import type { AgentConfig } from "./config";

export function buildServer(deps: {
  config: AgentConfig;
  printer: PrinterDriver;
  configError?: boolean;
  /**
   * Destino dos logs. Default: o logger de arquivo. Testes injetam um em memoria.
   * Tipado como FastifyBaseLogger (nao como o Logger do pino) senao o Fastify
   * parametriza a instancia com Logger e o retorno deixa de bater com FastifyInstance.
   */
  loggerInstance?: FastifyBaseLogger;
}): FastifyInstance {
  const log = deps.loggerInstance ?? defaultLogger;
  const app = Fastify({
    bodyLimit: MAX_BODY_BYTES,
    // Fastify 5: instancia pronta vai em `loggerInstance` (o `logger` nao aceita
    // mais instancia). Aqui estava `logger: false`, que faz o Fastify injetar um
    // req.log NO-OP -- e entao os req.log.info("printed") / req.log.error("print
    // failed") das rotas eram descartados em silencio. O agent.log nao registrava
    // nem impressao nem falha de impressao: exatamente o rastro que falta quando
    // a nota nao sai e o navegador abre o dialogo.
    loggerInstance: log,
    // ...mas sem "incoming request"/"request completed" de toda requisicao: o
    // /health e pollado a cada 30s e afogaria o log em ruido.
    disableRequestLogging: true,
  });

  // Camada 2: origin/host/CORS/PNA antes de tudo.
  app.addHook("onRequest", makeOriginGuard(deps.config.allowedOrigins));

  // Recusa nao deixava rastro: origin-guard e auth-hook respondem direto, sem
  // logar. Com o Axis barrado por Origin fora da allow-list ou token dessincronizado,
  // o sintoma no caixa e IDENTICO ao de agente morto (o front cai no window.print)
  // -- e o log nao distinguia os dois. Sem isto o diagnostico e cego.
  app.addHook("onResponse", async (req, reply) => {
    if (reply.statusCode !== 401 && reply.statusCode !== 403) return;
    log.warn(
      {
        url: req.url,
        status: reply.statusCode,
        origin: req.headers.origin ?? null,
        host: req.headers.host ?? null,
      },
      "requisicao recusada",
    );
  });

  // Camada 5: rate limit (loop protection).
  app.register(rateLimit, { max: RATE_LIMIT_MAX, timeWindow: RATE_LIMIT_WINDOW });

  const requireAuth = makeRequireAuth(() => deps.config.token);
  // Rotas em app.after(): DEPOIS do load do rate-limit, senao o hook global do
  // plugin nao se aplica a rotas registradas no mesmo tick (escapam do limite).
  app.after(() => {
    registerHealthRoute(app, { printer: deps.printer, printerName: deps.config.printerName, configError: deps.configError });
    registerPrintersRoute(app, { printer: deps.printer, requireAuth });
    registerPrintRoute(app, { printer: deps.printer, requireAuth });
    registerConfigRoute(app, { config: deps.config, requireAuth });
    // Mesma allow-list do origin-guard (linha do addHook acima) — uma fonte so.
    registerDeviceCredentialRoute(app, { config: deps.config, allowedOrigins: deps.config.allowedOrigins });
  });

  return app;
}
