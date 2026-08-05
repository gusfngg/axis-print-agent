/** Camada 1: bind hardcoded no loopback. Mudar isto quebra o teste de bind. */
export const BIND_HOST = "127.0.0.1" as const;
export const PORT = 9101 as const;
/**
 * Versao reportada no /health. BUMPAR JUNTO com a "version" do package.json:
 * ficaram dessincronizados entre a v1.0.1 e a v1.0.3 (package em 1.0.1, esta
 * constante em 1.0.0) e o /health passou a mentir a versao -- justo o campo
 * usado pra conferir se o totem pegou a build nova. O `build` (AGENT_BUILD)
 * carrega tag+sha do release e continua sendo a fonte precisa.
 */
export const AGENT_VERSION = "1.0.4" as const;
/** Build stamp injetado pelo tsup `define` (gitSHA/timestamp); fallback "dev" em dev/teste. */
export const AGENT_BUILD = process.env.AGENT_BUILD ?? "dev";

/** Camada 4: limite de body (DoS). */
export const MAX_BODY_BYTES = 32 * 1024;

/** Camada 5: rate limit. Sempre 127.0.0.1, mas previne loop maluco no front. */
export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW = "1 minute";

/** Camada 2: hosts aceitos no header Host. */
export const ALLOWED_HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`] as const;
