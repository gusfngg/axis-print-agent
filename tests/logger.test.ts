// tests/logger.test.ts
import { describe, it, expect } from "vitest";
import pino from "pino";
import { redactLog } from "../src/logger";

/**
 * Contrato da Camada 6: o `formatters.log` do pino redata o OBJETO DE MERGE
 * ESTRUTURADO (os campos). Aqui montamos uma instância pino local com um
 * destination síncrono (não usamos o transport pino-roll real, que escreve em
 * arquivo e é difícil de testar) reusando o MESMO `redactLog` da config de
 * produção, para exercitar o formatter de verdade.
 *
 * NOTA SOBRE O CONTRATO: a string `msg` NÃO é redatada pelo formatter do pino —
 * o `formatters.log` só recebe o objeto de merge, nunca a mensagem. Por isso
 * PII deve sempre ir nos CAMPOS (objeto de merge), nunca interpolada na msg.
 */
describe("logger formatters.log (Camada 6)", () => {
  it("redata campos estruturados sensíveis e preserva msg + campos limpos", () => {
    let line = "";
    const sink = {
      write: (chunk: string) => {
        line += chunk;
        return true;
      },
    };

    const testLogger = pino(
      {
        formatters: { log: redactLog },
      },
      sink as unknown as NodeJS.WritableStream,
    );

    testLogger.info(
      { token: "secret", cpfCnpj: "111.444.777-35", action: "print" },
      "printed",
    );

    const record = JSON.parse(line.trim());

    expect(record.token).toBe("[REDACTED]");
    expect(record.cpfCnpj).toBe("[REDACTED]");
    expect(record.action).toBe("print");
    // `msg` passa intacto: o formatter do pino NÃO redata a mensagem.
    expect(record.msg).toBe("printed");
  });
});
