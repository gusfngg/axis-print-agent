/**
 * Camada 4: remove bytes de controle (codepoint < 0x20) e DEL (0x7F) de uma
 * string antes de mandar pra impressora. Bloqueia comandos ESC/POS embutidos
 * em campos de texto do ReceiptDto. Acentos pt-BR (>= 0x80) são preservados —
 * o mapeamento pro codepage da impressora é responsabilidade do
 * node-thermal-printer (characterSet).
 */
export function sanitizeText(input: string): string {
  let out = "";
  for (const ch of input) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c !== 0x7f) out += ch;
  }
  return out;
}
