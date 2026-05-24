// tests/bind-localhost.test.ts
import { describe, it, expect } from "vitest";
import { BIND_HOST, PORT, MAX_BODY_BYTES } from "../src/constants";

describe("Camada 1 — network isolation", () => {
  it("bindeia somente no loopback, NUNCA em 0.0.0.0", () => {
    expect(BIND_HOST).toBe("127.0.0.1");
    expect(BIND_HOST).not.toBe("0.0.0.0");
  });

  it("usa a porta 9101 e limita o body a 32KB", () => {
    expect(PORT).toBe(9101);
    expect(MAX_BODY_BYTES).toBe(32 * 1024);
  });
});
