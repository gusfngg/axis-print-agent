import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer";
import type { PrinterDriver } from "./printer-driver";
import { AUTO_PRINTER, type AgentConfig } from "./config";
import { pickPrinterName } from "./printer-select";
import type { ReceiptDto, TicketDto } from "./receipt-dto";
import { buildReceiptOps, type ReceiptOp } from "./receipt-layout";
import { buildTicketOps } from "./ticket-layout";
import { logger } from "./logger";

// Lazy-require do nativo: importar este arquivo NÃO deve carregar o binário.
function nativeDriver(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@thiagoelg/node-printer");
}

function applyOp(p: ThermalPrinter, op: ReceiptOp): void {
  switch (op.op) {
    case "align":
      if (op.v === "center") p.alignCenter();
      else if (op.v === "right") p.alignRight();
      else p.alignLeft();
      break;
    case "bold": p.bold(op.v); break;
    case "size":
      // "huge" = GS ! 0x77 (8x altura e largura): numero da senha lido a distancia.
      if (op.v === "huge") p.setTextSize(7, 7);
      else if (op.v === "quad") p.setTextQuadArea();
      else if (op.v === "double") p.setTextDoubleHeight();
      else p.setTextNormal();
      break;
    case "text": p.println(op.v); break;
    case "leftRight": p.leftRight(op.l, op.r); break;
    case "line": p.drawLine(); break;
    case "newline": p.newLine(); break;
    // `cellSize: 6` cabe a URL da NFC-e (~200 chars) em 80mm ainda legivel por
    // celular; `correction: "M"` e o nivel recomendado pro DANFE.
    case "qrcode": p.printQR(op.v, { cellSize: 6, correction: "M", model: 2 }); break;
    // Comanda do SIAC: CODE128 do número do pedido (7-10 dígitos cabem folgados em
    // 80mm com barra LARGE); texto legível abaixo das barras (HRI) pro atendente.
    case "barcode": p.code128(op.v, { width: "LARGE", height: 80, text: 3 }); break;
    case "cut": p.cut(); break;
  }
}

export class NodeThermalPrinterDriver implements PrinterDriver {
  constructor(private cfg: AgentConfig) {}

  /**
   * `printerName: "auto"` (default do primeiro run) NAO e nome de fila valido:
   * se descesse cru viraria `printer:auto` e so quebraria na hora de imprimir,
   * com o cliente esperando. Aqui vira a impressora padrao do SO; sem padrao,
   * usa a unica instalada. null = nao da pra decidir (0, ou varias sem padrao)
   * — quem chama falha explicito em vez de chutar a fila errada.
   */
  resolvePrinterName(): string | null {
    if (this.cfg.printerName !== AUTO_PRINTER) return this.cfg.printerName;
    let osDefault: string | null = null;
    try {
      const def = nativeDriver().getDefaultPrinterName?.();
      if (typeof def === "string") osDefault = def;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "printer.getDefaultPrinterName failed");
    }
    return pickPrinterName(this.cfg.printerName, osDefault, this.listPrinters());
  }

  private make(): ThermalPrinter {
    const name = this.resolvePrinterName();
    if (!name) {
      throw new Error(
        "PRINTER_NOT_CONFIGURED: printerName='auto' e nao foi possivel resolver a impressora padrao. " +
          "Liste com GET /printers e escolha via POST /config.",
      );
    }
    return new ThermalPrinter({
      type: (PrinterTypes as Record<string, PrinterTypes>)[this.cfg.printerType] ?? PrinterTypes.EPSON,
      interface: `printer:${name}`,
      driver: nativeDriver(),
      width: 48,
      characterSet:
        (CharacterSet as Record<string, CharacterSet>)[this.cfg.characterSet] ?? CharacterSet.PC860_PORTUGUESE,
      removeSpecialCharacters: false,
    });
  }

  async isConnected(): Promise<boolean> {
    try {
      return await this.make().isPrinterConnected();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "printer.isConnected failed");
      return false;
    }
  }

  listPrinters(): string[] {
    try {
      const printers = nativeDriver().getPrinters() as Array<{ name: string }>;
      return printers.map((x) => x.name);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "printer.listPrinters failed");
      return [];
    }
  }

  async printReceipt(dto: ReceiptDto): Promise<void> {
    const p = this.make();
    for (const op of buildReceiptOps(dto)) applyOp(p, op);
    await p.execute({ docname: `Axis ${dto.saleNumber}` });
  }

  async printTicket(dto: TicketDto): Promise<void> {
    const p = this.make();
    for (const op of buildTicketOps(dto)) applyOp(p, op);
    await p.execute({ docname: `Axis senha ${dto.number}` });
  }
}
