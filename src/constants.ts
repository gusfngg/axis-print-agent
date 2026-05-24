/** Camada 1: bind hardcoded no loopback. Mudar isto quebra o teste de bind. */
export const BIND_HOST = "127.0.0.1" as const;
export const PORT = 9101 as const;
export const AGENT_VERSION = "1.0.0" as const;

/** Camada 4: limite de body (DoS). */
export const MAX_BODY_BYTES = 32 * 1024;

/** Camada 5: rate limit. Sempre 127.0.0.1, mas previne loop maluco no front. */
export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW = "1 minute";

/** Camada 2: hosts aceitos no header Host. */
export const ALLOWED_HOSTS = [`127.0.0.1:${PORT}`, `localhost:${PORT}`] as const;
