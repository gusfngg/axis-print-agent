import type { ReceiptDto } from "./receipt-dto";
import { sanitizeText } from "./sanitize";

export type ReceiptOp =
  | { op: "align"; v: "center" | "left" | "right" }
  | { op: "bold"; v: boolean }
  | { op: "size"; v: "normal" | "double" | "quad" }
  | { op: "text"; v: string }
  | { op: "leftRight"; l: string; r: string }
  | { op: "line" }
  | { op: "newline" }
  /**
   * Conteúdo do QR **cru**, como veio do XML autorizado (assinado pelo CSC do
   * CNPJ da loja). NÃO passa por `sanitizeText`: o texto vai pro módulo de QR da
   * impressora, não como ESC/POS de texto, e qualquer byte removido invalidaria
   * a assinatura que a SEFAZ confere na leitura.
   */
  | { op: "qrcode"; v: string }
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
  // toLocaleString insere NBSP (U+00A0) entre "R$" e os digitos; troca por espaco
  // comum (NBSP vira glifo lixo / desalinha colunas no codepage nao-UTF da termica).
  const nbsp = String.fromCharCode(0xa0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).split(nbsp).join(" ");
}

function qty(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function dateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Chave em grupos de 4 — como o DANFE exige, para conferência a olho. */
function chaveEmGrupos(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/**
 * DANFE NFC-e — documento auxiliar da nota JÁ autorizada (o agente não emite
 * nada; só desenha o que a SEFAZ autorizou). A ordem dos blocos segue o Manual
 * de Orientação do Contribuinte: identificação do emitente → itens → totais →
 * pagamentos → tributos (Lei 12.741) → chave de acesso → consumidor → protocolo
 * → QR Code.
 *
 * O que NÃO se mexe sem ler a norma: o texto do QR (assinado), a chave impressa
 * por extenso (é o caminho de consulta quando o QR não lê) e o aviso de
 * homologação.
 */
function buildDanfeOps(dto: ReceiptDto, fiscal: NonNullable<ReceiptDto["fiscal"]>): ReceiptOp[] {
  const ops: ReceiptOp[] = [];
  const text = (v: string) => ops.push({ op: "text", v: sanitizeText(v) });

  ops.push({ op: "align", v: "center" });
  if (dto.reprint) {
    ops.push({ op: "bold", v: true });
    text("** 2a VIA / REIMPRESSAO **");
    ops.push({ op: "bold", v: false }, { op: "newline" });
  }

  ops.push({ op: "bold", v: true });
  text(dto.branch.name);
  ops.push({ op: "bold", v: false });
  if (dto.branch.cnpj) text(`CNPJ: ${dto.branch.cnpj}`);
  text(dto.branch.address);
  text(`${dto.branch.city}/${dto.branch.state}  ${dto.branch.phone}`);
  ops.push({ op: "line" });

  text("DANFE NFC-e - Documento Auxiliar da");
  text("Nota Fiscal de Consumidor Eletronica");
  ops.push({ op: "line" });

  // Cabeçalho da tabela de itens: as colunas são exigidas pelo MOC.
  ops.push({ op: "align", v: "left" });
  text("COD  DESCRICAO");
  text("QTD UN   VL UNIT       VL TOTAL");
  ops.push({ op: "line" });

  for (const [i, it] of dto.items.entries()) {
    text(`${String(i + 1).padStart(3, "0")}  ${it.code ?? "-"}  ${it.description}`);
    ops.push({
      op: "leftRight",
      l: `     ${qty(it.quantity)} ${it.unit ?? "UN"} x ${money(it.unitPrice)}`,
      r: money(it.subtotal),
    });
  }
  ops.push({ op: "line" });

  ops.push({ op: "leftRight", l: "Qtd. total de itens", r: String(dto.items.length) });
  ops.push({ op: "leftRight", l: "Valor total R$", r: money(dto.subtotal) });
  if (dto.discount > 0) ops.push({ op: "leftRight", l: "Desconto R$", r: `-${money(dto.discount)}` });
  ops.push({ op: "bold", v: true });
  ops.push({ op: "leftRight", l: "VALOR A PAGAR R$", r: money(dto.total) });
  ops.push({ op: "bold", v: false }, { op: "line" });

  ops.push({ op: "leftRight", l: "FORMA DE PAGAMENTO", r: "VALOR PAGO" });
  ops.push({ op: "leftRight", l: PAYMENT_LABELS[dto.payment.method], r: money(dto.total) });
  if (dto.payment.tef) {
    text(`  NSU: ${dto.payment.tef.nsu}  Aut: ${dto.payment.tef.authCode}`);
    text(`  Bandeira: ${dto.payment.tef.brand}`);
  }
  ops.push({ op: "line" });

  if (fiscal.tributos !== undefined) {
    ops.push({ op: "align", v: "center" });
    text("Informacao dos Tributos Totais Incidentes");
    text(`(Lei Federal 12.741/2012): ${money(fiscal.tributos)}`);
    ops.push({ op: "line" });
  }

  ops.push({ op: "align", v: "center" });
  text("Consulte pela Chave de Acesso em");
  if (fiscal.urlConsulta) text(fiscal.urlConsulta);
  text(chaveEmGrupos(fiscal.chaveAcesso));
  ops.push({ op: "line" });

  text(fiscal.consumidor ? `CONSUMIDOR: ${fiscal.consumidor}` : "CONSUMIDOR NAO IDENTIFICADO");
  ops.push({ op: "line" });

  text(`NFC-e no. ${fiscal.numero}  Serie ${fiscal.serie}`);
  text(dateTimeBR(dto.createdAt));
  if (fiscal.protocolo) {
    text(`Protocolo de Autorizacao: ${fiscal.protocolo}`);
    if (fiscal.autorizadaEm) text(dateTimeBR(fiscal.autorizadaEm));
  }
  ops.push({ op: "newline" });

  ops.push({ op: "qrcode", v: fiscal.qrCode });

  if (fiscal.ambiente === "homologacao") {
    ops.push({ op: "newline" }, { op: "bold", v: true });
    text("EMITIDA EM AMBIENTE DE HOMOLOGACAO");
    text("SEM VALOR FISCAL");
    ops.push({ op: "bold", v: false });
  }

  if (dto.footerMessage) {
    ops.push({ op: "newline" });
    text(dto.footerMessage);
  }
  ops.push({ op: "newline" }, { op: "cut" });
  return ops;
}

/**
 * Monta a sequência de operações de impressão (80mm, 48 colunas). Puro.
 * Com `fiscal`, sai o DANFE NFC-e; sem ele, a notinha de caixa não-fiscal.
 */
export function buildReceiptOps(dto: ReceiptDto): ReceiptOp[] {
  if (dto.fiscal) return buildDanfeOps(dto, dto.fiscal);
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
