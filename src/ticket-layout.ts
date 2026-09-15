import type { TicketDto } from "./receipt-dto";
import type { ReceiptOp } from "./receipt-layout";
import { sanitizeText } from "./sanitize";

/**
 * `dd/MM HH:mm` SEMPRE em America/Sao_Paulo. O fuso do Windows do totem não
 * decide nada: `formatToParts` porque o `format` do pt-BR insere ", " entre
 * data e hora.
 */
function dateTimeSP(iso: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} ${get("hour")}:${get("minute")}`;
}

/** Cupom de senha (80mm, 48 colunas). Puro. Sem QR, sem logo. Tudo centralizado. */
export function buildTicketOps(dto: TicketDto): ReceiptOp[] {
  const ops: ReceiptOp[] = [];
  const text = (v: string) => ops.push({ op: "text", v: sanitizeText(v) });

  ops.push({ op: "align", v: "center" }, { op: "bold", v: true }, { op: "size", v: "double" });
  text(dto.branchName);
  ops.push({ op: "size", v: "normal" }, { op: "bold", v: false });
  text("SENHA DE ATENDIMENTO");
  ops.push({ op: "line" });

  // 8x: 4 digitos (max 9999) = 32 colunas, cabe nas 48. Volta a normal logo
  // depois — estado de fonte nao pode vazar pra proxima impressao.
  ops.push({ op: "newline" }, { op: "size", v: "huge" }, { op: "bold", v: true });
  text(String(dto.number));
  ops.push({ op: "bold", v: false }, { op: "size", v: "normal" }, { op: "newline" }, { op: "line" });

  text(`Retirada: ${dateTimeSP(dto.issuedAt)}`);
  text("Aguarde ser chamado no painel");
  ops.push({ op: "newline" }, { op: "newline" }, { op: "cut" });
  return ops;
}
