// tests/receipt-dto.test.ts
import { describe, it, expect } from "vitest";
import { ReceiptDto, PrintRequest } from "../src/receipt-dto";

const valid = {
  saleNumber: "VEN-00001",
  createdAt: "2026-05-24T12:00:00.000Z",
  branch: { name: "Super Auto Centro", address: "Rua X, 100", city: "Goiania", state: "GO", phone: "(62) 3000-0000" },
  items: [{ description: "Filtro de oleo", quantity: 2, unitPrice: 25.5, subtotal: 51 }],
  subtotal: 51,
  discount: 0,
  total: 51,
  payment: { method: "DINHEIRO" },
  footerMessage: "Obrigado pela preferencia",
  reprint: false,
};

describe("ReceiptDto (contrato com o Axis)", () => {
  it("aceita um payload valido", () => {
    expect(ReceiptDto.safeParse(valid).success).toBe(true);
  });

  it("rejeita saleNumber fora do padrao VEN-#####", () => {
    expect(ReceiptDto.safeParse({ ...valid, saleNumber: "X-1" }).success).toBe(false);
  });

  it("rejeita state com != 2 chars", () => {
    expect(ReceiptDto.safeParse({ ...valid, branch: { ...valid.branch, state: "GOI" } }).success).toBe(false);
  });

  it("rejeita lista de itens vazia e acima de 200", () => {
    expect(ReceiptDto.safeParse({ ...valid, items: [] }).success).toBe(false);
    const many = Array.from({ length: 201 }, () => valid.items[0]);
    expect(ReceiptDto.safeParse({ ...valid, items: many }).success).toBe(false);
  });

  it("aceita bloco TEF opcional", () => {
    const withTef = { ...valid, payment: { method: "CARTAO_CREDITO", tef: { nsu: "123", authCode: "A1", brand: "VISA" } } };
    expect(ReceiptDto.safeParse(withTef).success).toBe(true);
  });

  it("PrintRequest envelopa o receipt", () => {
    expect(PrintRequest.safeParse({ receipt: valid }).success).toBe(true);
    expect(PrintRequest.safeParse(valid).success).toBe(false);
  });
});
