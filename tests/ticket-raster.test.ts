// tests/ticket-raster.test.ts
import { describe, it, expect } from "vitest";
import { buildTicketRaster } from "../src/ticket-raster";

const base = { number: 27, issuedAt: "2026-10-28T15:20:00.000Z", branchName: "Ibiúna" };

/** Cabeçalhos GS v 0 do buffer: largura em bytes e altura de cada faixa. */
function bands(buf: Buffer): Array<{ bpr: number; h: number }> {
  const out: Array<{ bpr: number; h: number }> = [];
  let i = 2;
  while (i < buf.length) {
    expect([...buf.subarray(i, i + 4)]).toEqual([0x1d, 0x76, 0x30, 0x00]);
    const bpr = buf.readUInt16LE(i + 4);
    const h = buf.readUInt16LE(i + 6);
    out.push({ bpr, h });
    i += 8 + bpr * h;
  }
  expect(i).toBe(buf.length);
  return out;
}

describe("buildTicketRaster (cupom de senha em imagem)", () => {
  it("ESC @ + faixas GS v 0 de 576 px (72 bytes), no máximo 128 linhas cada", () => {
    const buf = buildTicketRaster(base)!;
    expect([...buf.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    const b = bands(buf);
    expect(b.every((x) => x.bpr === 72 && x.h > 0 && x.h <= 128)).toBe(true);
    const total = b.reduce((s, x) => s + x.h, 0);
    expect(total).toBeGreaterThan(450);
    expect(total).toBeLessThan(1000);
  });

  it.each([1, 99, 999, 1000, 9999])("número %i cabe (3 e 4 dígitos usam fontes menores)", (number) => {
    expect(buildTicketRaster({ ...base, number })).not.toBeNull();
  });

  it.each(["São Roque", "Ibiúna", "Sorocaba - Centro", "Itapetininga"])("filial %s cabe", (branchName) => {
    expect(buildTicketRaster({ ...base, branchName })).not.toBeNull();
  });

  it("caractere sem glifo ou filial larga demais → null (o driver imprime o cupom de texto)", () => {
    expect(buildTicketRaster({ ...base, branchName: "Filial Ω" })).toBeNull();
    expect(buildTicketRaster({ ...base, branchName: "W".repeat(40) })).toBeNull();
  });
});
