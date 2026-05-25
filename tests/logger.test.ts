// tests/logger.test.ts  (substitui o conteúdo existente)
import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { redactLog, createLogger } from "../src/logger";

function capture(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
  });
  return { stream, lines: () => chunks.join("").trim().split("\n").filter(Boolean) };
}

describe("logger", () => {
  it("redactLog redige campos sensiveis e preserva o resto", () => {
    const out = redactLog({ token: "x", cpfCnpj: "1", action: "print" });
    expect(out.token).toBe("[REDACTED]");
    expect(out.cpfCnpj).toBe("[REDACTED]");
    expect(out.action).toBe("print");
  });

  it("createLogger escreve no destino, com campos redigidos e msg intacta", () => {
    const { stream, lines } = capture();
    const log = createLogger(stream);
    log.info({ token: "secret", action: "print" }, "printed");
    const rec = JSON.parse(lines()[0]!);
    expect(rec.token).toBe("[REDACTED]");
    expect(rec.action).toBe("print");
    expect(rec.msg).toBe("printed"); // msg NAO e scrubada (contrato documentado)
  });

  it("createLogger nunca lanca quando o stream falha (resiliencia)", () => {
    const bad = new Writable({ write(_c, _e, cb) { cb(new Error("disk full")); } });
    const log = createLogger(bad);
    expect(() => log.info({ a: 1 }, "x")).not.toThrow();
  });
});
