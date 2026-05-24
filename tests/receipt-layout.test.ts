// tests/receipt-layout.test.ts
import { describe, it, expect } from "vitest";
import { buildReceiptOps } from "../src/receipt-layout";
import type { ReceiptDto } from "../src/receipt-dto";

const base: ReceiptDto = {
  saleNumber: "VEN-00042",
  createdAt: "2026-05-24T15:30:00.000Z",
  branch: { name: "Super Auto", address: "Rua X, 1", city: "Goiania", state: "GO", phone: "(62) 3000-0000" },
  items: [{ description: "Filtro", quantity: 1, unitPrice: 10, subtotal: 10 }],
  subtotal: 10,
  discount: 0,
  total: 10,
  payment: { method: "DINHEIRO" },
  footerMessage: "Obrigado",
  reprint: false,
};

const texts = (ops: ReturnType<typeof buildReceiptOps>) =>
  ops.filter((o) => o.op === "text").map((o) => (o as { v: string }).v).join("|");

describe("buildReceiptOps", () => {
  it("inclui banner de 2a via quando reprint=true", () => {
    expect(texts(buildReceiptOps({ ...base, reprint: true }))).toContain("2a VIA");
    expect(texts(buildReceiptOps({ ...base, reprint: false }))).not.toContain("2a VIA");
  });

  it("sanitiza ESC/POS na descricao do item", () => {
    // ESC (0x1B) e removido pela sanitizeText; '@' (0x40) e imprimivel e preservado.
    const ops = buildReceiptOps({ ...base, items: [{ description: "Mal\x1B@icioso", quantity: 1, unitPrice: 1, subtotal: 1 }] });
    expect(texts(ops)).toContain("Mal@icioso");
    expect(texts(ops)).not.toContain("\x1B");
  });

  it("omite linha de desconto quando 0 e inclui quando > 0", () => {
    const noDisc = buildReceiptOps(base).filter((o) => o.op === "leftRight") as Array<{ l: string }>;
    expect(noDisc.some((o) => o.l === "Desconto")).toBe(false);
    const withDisc = buildReceiptOps({ ...base, discount: 5 }).filter((o) => o.op === "leftRight") as Array<{ l: string }>;
    expect(withDisc.some((o) => o.l === "Desconto")).toBe(true);
  });

  it("inclui bloco TEF so quando presente", () => {
    expect(texts(buildReceiptOps(base))).not.toContain("NSU");
    const tef = buildReceiptOps({ ...base, payment: { method: "CARTAO_CREDITO", tef: { nsu: "999", authCode: "A1", brand: "VISA" } } });
    expect(texts(tef)).toContain("999");
    expect(texts(tef)).toContain("VISA");
  });

  it("sempre termina com cut", () => {
    const ops = buildReceiptOps(base);
    expect(ops[ops.length - 1]!.op).toBe("cut");
  });
});
