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

/** Cupom de senha (80mm). Puro. Sem QR, sem logo. */
export function buildTicketOps(dto: TicketDto): ReceiptOp[] {
  const ops: ReceiptOp[] = [];
  const text = (v: string) => ops.push({ op: "text", v: sanitizeText(v) });

  ops.push({ op: "align", v: "center" }, { op: "bold", v: true });
  text(dto.branchName);
  ops.push({ op: "bold", v: false }, { op: "line" });

  text("SENHA");
  ops.push({ op: "size", v: "quad" }, { op: "bold", v: true });
  text(String(dto.number));
  ops.push({ op: "bold", v: false }, { op: "size", v: "normal" });
  text(dateTimeSP(dto.issuedAt));
  ops.push({ op: "line" });

  text("Aguarde ser chamado no painel");
  ops.push({ op: "newline" }, { op: "cut" });
  return ops;
}
