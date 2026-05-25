/**
 * Mutex async simples (fila de 1). `run(fn)` so executa `fn` depois que a
 * execucao anterior terminou (resolvendo ou rejeitando). Preserva a ordem de
 * chamada. Uma rejeicao nao trava as proximas.
 */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
