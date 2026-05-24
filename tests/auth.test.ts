// tests/auth.test.ts
import { describe, it, expect } from "vitest";
import { extractBearer, tokenMatches } from "../src/auth";

describe("auth (Camada 3)", () => {
  it("extrai o token do header Bearer", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
  });

  it("retorna null pra header ausente ou mal formado", () => {
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer("abc123")).toBeNull();
    expect(extractBearer("Basic abc")).toBeNull();
  });

  it("compara tokens iguais como match", () => {
    expect(tokenMatches("s3cr3t", "s3cr3t")).toBe(true);
  });

  it("rejeita tokens diferentes (inclusive tamanhos diferentes, sem lançar)", () => {
    expect(tokenMatches("s3cr3t", "outro")).toBe(false);
    expect(tokenMatches("curto", "muito-mais-longo-token")).toBe(false);
    expect(tokenMatches("", "x")).toBe(false);
  });
});
