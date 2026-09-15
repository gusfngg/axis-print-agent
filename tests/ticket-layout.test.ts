// tests/ticket-layout.test.ts
import { describe, it, expect } from "vitest";
import { buildTicketOps } from "../src/ticket-layout";
import { TicketDto } from "../src/receipt-dto";

const fixture = { number: 12, issuedAt: "2026-09-14T13:05:00.000Z", branchName: "São Roque" };

describe("buildTicketOps (cupom de senha)", () => {
  it("golden: loja em bold+double, titulo, numero em size huge (8x) com folga antes/depois, hora em America/Sao_Paulo, aviso, 2 linhas e corte", () => {
    const ops = buildTicketOps(fixture);
    expect(ops).toEqual([
      { op: "align", v: "center" },
      { op: "bold", v: true },
      { op: "size", v: "double" },
      { op: "text", v: "São Roque" },
      { op: "size", v: "normal" },
      { op: "bold", v: false },
      { op: "text", v: "SENHA DE ATENDIMENTO" },
      { op: "line" },
      { op: "newline" },
      { op: "size", v: "huge" },
      { op: "bold", v: true },
      { op: "text", v: "12" },
      { op: "bold", v: false },
      { op: "size", v: "normal" },
      { op: "newline" },
      { op: "line" },
      // 13:05Z = 10:05 em Sao Paulo (UTC-3) — nunca o fuso do Windows.
      { op: "text", v: "Retirada: 14/09 10:05" },
      { op: "text", v: "Aguarde ser chamado no painel" },
      { op: "newline" },
      { op: "newline" },
      { op: "cut" },
    ]);
    // Estado de fonte nunca vaza: o ultimo "size" antes do corte e normal.
    const sizes = ops.filter((o) => o.op === "size");
    expect(sizes.at(-1)).toEqual({ op: "size", v: "normal" });
  });

  it("sanitiza ESC/POS no nome da loja", () => {
    const ops = buildTicketOps({ ...fixture, branchName: "Loja\x1B@x" });
    expect(ops.some((o) => o.op === "text" && o.v.includes("\x1B"))).toBe(false);
  });

  it("TicketDto: rejeita number fora de 1..9999 e branchName > 80", () => {
    expect(TicketDto.safeParse(fixture).success).toBe(true);
    expect(TicketDto.safeParse({ ...fixture, number: 0 }).success).toBe(false);
    expect(TicketDto.safeParse({ ...fixture, number: 10000 }).success).toBe(false);
    expect(TicketDto.safeParse({ ...fixture, number: 1.5 }).success).toBe(false);
    expect(TicketDto.safeParse({ ...fixture, branchName: "x".repeat(81) }).success).toBe(false);
  });
});
