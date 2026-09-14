import type { ReceiptDto, TicketDto } from "./receipt-dto";

export interface PrinterDriver {
  /** True se a impressora configurada está acessível. */
  isConnected(): Promise<boolean>;
  /** Imprime a notinha. Lança em falha de hardware. */
  printReceipt(dto: ReceiptDto): Promise<void>;
  /** Imprime o cupom de senha. Lança em falha de hardware. */
  printTicket(dto: TicketDto): Promise<void>;
  /** Lista os nomes de impressoras instaladas no SO. */
  listPrinters(): string[];
  /**
   * Nome da fila que sera usada de fato. Com `printerName: "auto"`, resolve pra
   * impressora padrao do SO (ou a unica instalada). `null` = nao deu pra
   * resolver — o agente sobe, mas /health acusa e a impressao falha explicito.
   */
  resolvePrinterName(): string | null;
}

/** Fake pra testes e modo dev (`--fake`). Registra o que "imprimiu". */
export class FakePrinterDriver implements PrinterDriver {
  connected: boolean;
  printed: ReceiptDto[] = [];
  printedTickets: TicketDto[] = [];
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
  async printTicket(dto: TicketDto): Promise<void> {
    if (this.shouldThrow) throw new Error("print exploded");
    this.printedTickets.push(dto);
  }
  listPrinters(): string[] {
    return this.printers;
  }
  resolvePrinterName(): string | null {
    return this.printers[0] ?? null;
  }
}
