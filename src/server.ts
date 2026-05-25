import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { MAX_BODY_BYTES, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from "./constants";
import { makeOriginGuard } from "./origin-guard";
import { makeRequireAuth } from "./auth-hook";
import { registerPrintRoute } from "./routes/print";
import { registerHealthRoute } from "./routes/health";
import { registerPrintersRoute } from "./routes/printers";
import { registerConfigRoute } from "./routes/config";
import type { PrinterDriver } from "./printer-driver";
import type { AgentConfig } from "./config";

export function buildServer(deps: { config: AgentConfig; printer: PrinterDriver }): FastifyInstance {
  const app = Fastify({ bodyLimit: MAX_BODY_BYTES, logger: false });

  // Camada 2: origin/host/CORS/PNA antes de tudo.
  app.addHook("onRequest", makeOriginGuard(deps.config.allowedOrigins));

  // Camada 5: rate limit (loop protection).
  app.register(rateLimit, { max: RATE_LIMIT_MAX, timeWindow: RATE_LIMIT_WINDOW });

  const requireAuth = makeRequireAuth(() => deps.config.token);
  // Rotas em app.after(): DEPOIS do load do rate-limit, senao o hook global do
  // plugin nao se aplica a rotas registradas no mesmo tick (escapam do limite).
  app.after(() => {
    registerHealthRoute(app, { printer: deps.printer, printerName: deps.config.printerName });
    registerPrintersRoute(app, { printer: deps.printer, requireAuth });
    registerPrintRoute(app, { printer: deps.printer, requireAuth });
    registerConfigRoute(app, { config: deps.config, requireAuth });
  });

  return app;
}
