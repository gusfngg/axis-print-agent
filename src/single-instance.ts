import { BIND_HOST, PORT } from "./constants";

/**
 * Detecta se a porta 9101 ja esta servida por um agente NOSSO e saudavel
 * (responde /health com { ok:true, version }). Usado pra decidir se um segundo
 * launch (ex: atalho de startup + processo ja rodando) deve sair limpo (exit 0)
 * em vez de morrer com exit(1).
 */
export async function isHealthyAgentRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://${BIND_HOST}:${PORT}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown; version?: unknown };
    return body.ok === true && typeof body.version === "string";
  } catch {
    return false;
  }
}
