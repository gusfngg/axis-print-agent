import type { ReceiptDto } from "./receipt-dto";
import { sanitizeText } from "./sanitize";

export type ReceiptOp =
  | { op: "align"; v: "center" | "left" | "right" }
  | { op: "bold"; v: boolean }
  | { op: "size"; v: "normal" | "double" }
  | { op: "text"; v: string }
  | { op: "leftRight"; l: string; r: string }
  | { op: "line" }
  | { op: "newline" }
  | { op: "cut" };

const PAYMENT_LABELS: Record<ReceiptDto["payment"]["method"], string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO_CREDITO: "Cartao de Credito",
  CARTAO_DEBITO: "Cartao de Debito",
  CREDIARIO: "Crediario",
  TRANSFERENCIA: "Transferencia",
};

function money(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function qty(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function dateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Monta a sequência de operações de impressão (80mm, 48 colunas). Puro. */
export function buildReceiptOps(dto: ReceiptDto): ReceiptOp[] {
  const ops: ReceiptOp[] = [];
  const text = (v: string) => ops.push({ op: "text", v: sanitizeText(v) });

  ops.push({ op: "align", v: "center" });
  if (dto.reprint) {
    ops.push({ op: "bold", v: true });
    text("** 2a VIA / REIMPRESSAO **");
    ops.push({ op: "bold", v: false });
    ops.push({ op: "newline" });
  }

  ops.push({ op: "bold", v: true }, { op: "size", v: "double" });
  text(dto.branch.name);
  ops.push({ op: "size", v: "normal" }, { op: "bold", v: false });
  text(dto.branch.address);
  text(`${dto.branch.city}/${dto.branch.state}  ${dto.branch.phone}`);
  ops.push({ op: "line" });

  ops.push({ op: "align", v: "left" });
  text(`Venda: ${dto.saleNumber}`);
  text(`Data:  ${dateTimeBR(dto.createdAt)}`);
  ops.push({ op: "line" });

  for (const it of dto.items) {
    text(it.description);
    ops.push({ op: "leftRight", l: `  ${qty(it.quantity)} x ${money(it.unitPrice)}`, r: money(it.subtotal) });
  }
  ops.push({ op: "line" });

  ops.push({ op: "leftRight", l: "Subtotal", r: money(dto.subtotal) });
  if (dto.discount > 0) ops.push({ op: "leftRight", l: "Desconto", r: `-${money(dto.discount)}` });
  ops.push({ op: "bold", v: true }, { op: "leftRight", l: "TOTAL", r: money(dto.total) }, { op: "bold", v: false });
  ops.push({ op: "line" });

  text(`Pagamento: ${PAYMENT_LABELS[dto.payment.method]}`);
  if (dto.payment.tef) {
    text(`  NSU: ${dto.payment.tef.nsu}`);
    text(`  Autorizacao: ${dto.payment.tef.authCode}`);
    text(`  Bandeira: ${dto.payment.tef.brand}`);
  }
  ops.push({ op: "line" });

  ops.push({ op: "align", v: "center" });
  text(dto.footerMessage);
  ops.push({ op: "newline" });
  ops.push({ op: "cut" });
  return ops;
}
