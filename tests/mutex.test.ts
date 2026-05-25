import { describe, it, expect } from "vitest";
import { createMutex } from "../src/mutex";

describe("createMutex", () => {
  it("serializa execucoes concorrentes preservando a ordem", async () => {
    const run = createMutex();
    const order: number[] = [];
    const slow = (n: number, ms: number) => run(async () => {
      await new Promise((r) => setTimeout(r, ms));
      order.push(n);
      return n;
    });
    const results = await Promise.all([slow(1, 30), slow(2, 5), slow(3, 1)]);
    expect(order).toEqual([1, 2, 3]); // mesmo com tempos invertidos, roda em serie na ordem de chamada
    expect(results).toEqual([1, 2, 3]);
  });

  it("uma rejeicao nao trava a fila", async () => {
    const run = createMutex();
    await expect(run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(run(async () => "ok")).resolves.toBe("ok");
  });
});
