import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RequireAuth } from "../auth-hook";

/**
 * POST /paygo-window — mostra/esconde as janelas do PayGo Windows na sessao do
 * kiosk (estorno assistido). O AxisKioskHelper esconde toda janela do PayGo por
 * padrao e reexibe enquanto existir `<kioskHelperDir>/show.flag`; este agente
 * (SYSTEM) e o unico processo do totem que o browser alcanca e que pode gravar
 * esse arquivo — powershell/cmd nao estao na AllowedApps do Assigned Access.
 *
 * Auth: print job assinado pelo Axis sobre o `command` (fingerprint no Bearer),
 * emitido so pela tela de manutencao (TOT3M01, codigo de 6 digitos). Um job de
 * `show:true` nao serve para `show:false` e vice-versa.
 *
 * Auto-esconder: `show:true` agenda `del` em AUTO_HIDE_MS. Tecnico esqueceu =
 * cliente veria a janela do PayGo por cima do totem (ponytail: timer unico,
 * um totem por agente; se um dia houver dois, vira mapa por dir).
 */
export const AUTO_HIDE_MS = 15 * 60 * 1000;
export const DEFAULT_KIOSK_HELPER_DIR = "C:\\ProgramData\\axis-kiosk-helper";

const bodySchema = z.object({
  command: z.object({ kind: z.literal("paygo-window"), show: z.boolean() }).strict(),
});

let autoHide: NodeJS.Timeout | null = null;

export function registerPaygoWindowRoute(
  app: FastifyInstance,
  deps: { requireAuth: RequireAuth; kioskHelperDir?: string; autoHideMs?: number },
): void {
  const dir = deps.kioskHelperDir ?? DEFAULT_KIOSK_HELPER_DIR;
  const flag = path.join(dir, "show.flag");
  const autoHideMs = deps.autoHideMs ?? AUTO_HIDE_MS;

  const hide = () => {
    if (autoHide) { clearTimeout(autoHide); autoHide = null; }
    try { fs.rmSync(flag, { force: true }); } catch { /* nada a esconder */ }
  };

  app.post("/paygo-window", { preHandler: deps.requireAuth }, async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: "BAD_REQUEST" });
    const { show } = parsed.data.command;
    try {
      if (show) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(flag, "");
        if (autoHide) clearTimeout(autoHide);
        autoHide = setTimeout(hide, autoHideMs);
        autoHide.unref?.();
      } else {
        hide();
      }
    } catch (err) {
      req.log.error({ err, flag }, "paygo-window falhou");
      return reply.code(500).send({ ok: false, error: "IO_ERROR" });
    }
    req.log.info({ show }, "paygo-window");
    return { ok: true, show, autoHideMs: show ? autoHideMs : 0 };
  });
}
