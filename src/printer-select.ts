import { AUTO_PRINTER } from "./config";

/**
 * Decide qual fila de impressao usar. Funcao PURA e sem dependencia nativa —
 * por isso mora fora do printer.ts (que carrega o binario do SO e so roda no
 * Windows). E o que permite testar essa decisao no CI/macOS.
 *
 * Regras:
 *  - nome explicito no config vence sempre (nao adivinha por cima do operador);
 *  - "auto" -> impressora padrao do SO;
 *  - sem padrao, mas exatamente UMA instalada -> usa ela (caso do totem);
 *  - 0 instaladas, ou varias sem padrao -> null (quem chama falha explicito).
 *
 * O null e deliberado: com varias impressoras e nenhuma padrao, chutar a
 * primeira da lista imprimiria a NFC-e no lugar errado — pior que falhar.
 */
export function pickPrinterName(
  configured: string,
  osDefault: string | null | undefined,
  all: string[],
): string | null {
  if (configured !== AUTO_PRINTER) return configured;
  if (typeof osDefault === "string" && osDefault.length > 0) return osDefault;
  return all.length === 1 ? (all[0] ?? null) : null;
}
