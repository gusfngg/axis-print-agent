import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer";
import type { PrinterDriver } from "./printer-driver";
import type { AgentConfig } from "./config";
import type { ReceiptDto } from "./receipt-dto";
import { buildReceiptOps, type ReceiptOp } from "./receipt-layout";
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
      if (op.v === "double") p.setTextDoubleHeight();
      else p.setTextNormal();
      break;
    case "text": p.println(op.v); break;
    case "leftRight": p.leftRight(op.l, op.r); break;
    case "line": p.drawLine(); break;
    case "newline": p.newLine(); break;
    case "cut": p.cut(); break;
  }
}

export class NodeThermalPrinterDriver implements PrinterDriver {
  constructor(private cfg: AgentConfig) {}

  private make(): ThermalPrinter {
    return new ThermalPrinter({
      type: (PrinterTypes as Record<string, PrinterTypes>)[this.cfg.printerType] ?? PrinterTypes.EPSON,
      interface: `printer:${this.cfg.printerName}`,
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
}
