// tests/sanitize.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeText } from "../src/sanitize";

describe("sanitizeText (Camada 4)", () => {
  it("remove ESC @ (reset) embutido", () => {
    // ESC (0x1B) e removido; '@' (0x40) e caractere imprimivel valido, preservado.
    expect(sanitizeText("Filtro\x1B@malicioso")).toBe("Filtro@malicioso");
  });

  it("remove GS e outros bytes de controle", () => {
    expect(sanitizeText("a\x1Db\x1Cc\x10d")).toBe("abcd");
  });

  it("remove quebras de linha e tab (campo e linha unica)", () => {
    expect(sanitizeText("linha1\nlinha2\r\tx")).toBe("linha1linha2x");
  });

  it("remove DEL (0x7F)", () => {
    expect(sanitizeText("a\x7Fb")).toBe("ab");
  });

  it("preserva acentos pt-BR e texto normal", () => {
    expect(sanitizeText("Óleo 5W30 ção")).toBe("Óleo 5W30 ção");
  });
});
