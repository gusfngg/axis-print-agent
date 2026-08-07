/** Camada 1: bind hardcoded no loopback. Mudar isto quebra o teste de bind. */
export const BIND_HOST = "127.0.0.1" as const;
export const PORT = 9101 as const;
/**
 * Versao reportada no /health, injetada pelo tsup a partir do `package.json`
 * (`define` em tsup.config.ts) — NAO ha mais nada pra bumpar aqui.
 *
 * Era um literal mantido a mao, e por isso ficou travado em "1.0.0" da v1.0.0
 * ate a v1.2.0: o /health mentia a versao justo no campo usado pra conferir se
 * o totem pegou a build nova. Ja houve um commit so pra ressincronizar
 * (1550ee5) e um comentario pedindo "bumpar junto" — os dois falharam, porque
 * dependiam de disciplina humana. Agora a fonte da verdade e uma so.
 *
 * "dev" fora do bundle (vitest/tsx nao passam pelo tsup); o `build`
 * (AGENT_BUILD) carrega tag+sha do release e segue sendo a referencia precisa.
 */
export const AGENT_VERSION = process.env.AGENT_VERSION ?? "dev";
/** Build stamp injetado pelo tsup `define` (gitSHA/timestamp); fallback "dev" em dev/teste. */
export const AGENT_BUILD = process.env.AGENT_BUILD ?? "dev";

/** Camada 4: limite de body (DoS). */
export const MAX_BODY_BYTES = 32 * 1024;

/** Camada 5: rate limit. Sempre 127.0.0.1, mas previne loop maluco no front. */
export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW = "1 minute";

/** Camada 2: hosts aceitos no header Host. */
export const ALLOWED_HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`] as const;
