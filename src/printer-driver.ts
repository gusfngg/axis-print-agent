import type { ReceiptDto } from "./receipt-dto";

export interface PrinterDriver {
  /** True se a impressora configurada está acessível. */
  isConnected(): Promise<boolean>;
  /** Imprime a notinha. Lança em falha de hardware. */
  printReceipt(dto: ReceiptDto): Promise<void>;
  /** Lista os nomes de impressoras instaladas no SO. */
  listPrinters(): string[];
}

/** Fake pra testes e modo dev (`--fake`). Registra o que "imprimiu". */
export class FakePrinterDriver implements PrinterDriver {
  connected: boolean;
  printed: ReceiptDto[] = [];
  printers: string[];
  shouldThrow = false;

  constructor(opts?: { connected?: boolean; printers?: string[] }) {
    this.connected = opts?.connected ?? true;
    this.printers = opts?.printers ?? ["FAKE-PRINTER"];
  }
  async isConnected(): Promise<boolean> {
    return this.connected;
  }
  async printReceipt(dto: ReceiptDto): Promise<void> {
    if (this.shouldThrow) throw new Error("print exploded");
    this.printed.push(dto);
  }
  listPrinters(): string[] {
    return this.printers;
  }
}
