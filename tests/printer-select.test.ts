import { describe, it, expect } from "vitest";
import { pickPrinterName } from "../src/printer-select";
import { AUTO_PRINTER } from "../src/config";

const TERMICA = "EPSON-TM-T20-RAW";
const PDF = "Microsoft Print to PDF";

describe("pickPrinterName", () => {
  it("nome explicito no config vence, mesmo havendo padrao no SO", () => {
    expect(pickPrinterName(TERMICA, PDF, [TERMICA, PDF])).toBe(TERMICA);
  });

  it("nome explicito vence mesmo que nao esteja instalado (erro fica pro driver, nao aqui)", () => {
    expect(pickPrinterName("FILA-QUE-SUMIU", PDF, [PDF])).toBe("FILA-QUE-SUMIU");
  });

  it("auto -> impressora padrao do SO", () => {
    expect(pickPrinterName(AUTO_PRINTER, TERMICA, [TERMICA, PDF])).toBe(TERMICA);
  });

  it("auto sem padrao, com UMA instalada -> usa ela (caso do totem)", () => {
    expect(pickPrinterName(AUTO_PRINTER, null, [TERMICA])).toBe(TERMICA);
  });

  it("auto sem padrao e VARIAS instaladas -> null (nao chuta a fila errada)", () => {
    expect(pickPrinterName(AUTO_PRINTER, null, [TERMICA, PDF])).toBeNull();
  });

  it("auto sem nenhuma impressora -> null", () => {
    expect(pickPrinterName(AUTO_PRINTER, null, [])).toBeNull();
  });

  it("auto com padrao vazio/undefined cai no fallback, nao vira nome vazio", () => {
    expect(pickPrinterName(AUTO_PRINTER, "", [TERMICA])).toBe(TERMICA);
    expect(pickPrinterName(AUTO_PRINTER, undefined, [TERMICA])).toBe(TERMICA);
    expect(pickPrinterName(AUTO_PRINTER, "", [TERMICA, PDF])).toBeNull();
  });
});
