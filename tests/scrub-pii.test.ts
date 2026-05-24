// tests/scrub-pii.test.ts
import { describe, it, expect } from "vitest";
import { scrubPII } from "../src/scrub-pii";

describe("scrubPII (Camada 6)", () => {
  it("redacta campos sensiveis por nome", () => {
    const out = scrubPII({ token: "abc", authorization: "Bearer x", cpfCnpj: "123", sale: "VEN-1" });
    expect(out.token).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.cpfCnpj).toBe("[REDACTED]");
    expect(out.sale).toBe("VEN-1");
  });

  it("redacta CPF/CNPJ/JWT dentro de strings", () => {
    expect(scrubPII("doc 123.456.789-00 fim")).toBe("doc [REDACTED] fim");
  });

  it("desce em objetos e arrays aninhados", () => {
    const out = scrubPII({ a: { items: [{ token: "x", ok: 1 }] } });
    expect((out.a.items[0] as any).token).toBe("[REDACTED]");
    expect((out.a.items[0] as any).ok).toBe(1);
  });
});
