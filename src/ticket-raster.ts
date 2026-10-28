import type { TicketDto } from "./receipt-dto";
import { AVISO, FONTS, LOGO, SENHA, type Bitmap, type GlyphStyle } from "./ticket-glyphs";
import { dateTimeSP } from "./ticket-layout";

const W = 576; // 80 mm a 203 dpi: 72 bytes por linha
const BAND = 128; // linhas por comando GS v 0 (impressora genérica não aguenta um bloco só)
const RULE = { x0: 40, x1: W - 40, h: 3 };

function bits(b: string): Uint8Array {
  return new Uint8Array(Buffer.from(b, "base64"));
}

/** Página 1-bit (1 = ponto preto) que cresce para baixo. */
class Page {
  px = new Uint8Array(W * 1000);
  y = 24;

  blit(src: Uint8Array, w: number, h: number, x: number, y: number): void {
    const bpr = (w + 7) >> 3;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++)
        if ((src[r * bpr + (c >> 3)] ?? 0) & (0x80 >> (c & 7))) this.px[(y + r) * W + x + c] = 1;
  }

  bitmap(bm: Bitmap, gap: number): void {
    this.blit(bits(bm.b), bm.w, bm.h, (W - bm.w) >> 1, this.y);
    this.y += bm.h + gap;
  }

  rule(gap: number): void {
    for (let r = 0; r < RULE.h; r++) this.px.fill(1, (this.y + r) * W + RULE.x0, (this.y + r) * W + RULE.x1);
    this.y += gap;
  }
}

/** Texto numa linha só, centralizado pela tinta. false = falta glifo ou não cabe. */
function line(page: Page, text: string, style: GlyphStyle, gap: number): boolean {
  let pen = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  const placed: Array<{ x: number; g: GlyphStyle["glyphs"][string] }> = [];
  for (const ch of text) {
    const g = style.glyphs[ch];
    if (!g) return false;
    if (g.w > 0) {
      placed.push({ x: pen + g.x, g });
      minX = Math.min(minX, pen + g.x);
      maxX = Math.max(maxX, pen + g.x + g.w);
    }
    pen += g.a;
  }
  if (placed.length === 0 || maxX - minX > W - 2 * RULE.x0) return false;
  const off = ((W - (maxX - minX)) >> 1) - minX;
  for (const { x, g } of placed) page.blit(bits(g.b), g.w, style.h, off + x, page.y);
  page.y += style.h + gap;
  return true;
}

function escPos(page: Page): Buffer {
  const bpr = W >> 3;
  const out: number[] = [0x1b, 0x40]; // ESC @
  for (let top = 0; top < page.y; top += BAND) {
    const h = Math.min(BAND, page.y - top);
    out.push(0x1d, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, h & 0xff, h >> 8); // GS v 0
    for (let y = top; y < top + h; y++)
      for (let bx = 0; bx < bpr; bx++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) if (page.px[y * W + bx * 8 + bit]) b |= 0x80 >> bit;
        out.push(b);
      }
  }
  return Buffer.from(out);
}

/**
 * Cupom de senha em imagem (v1.6, 2026-10-28): logo, fonte do site (Archivo) e o número liso.
 * O número em 8x da fonte da impressora saía em "escadinha". Mesmo desenho aprovado no papel em
 * Ibiúna. null = algum texto sem glifo ou largo demais: o chamador usa o cupom de texto.
 */
export function buildTicketRaster(dto: TicketDto): Buffer | null {
  const page = new Page();
  const num = String(dto.number);
  page.bitmap(LOGO, 28);
  if (!line(page, dto.branchName.toLocaleUpperCase("pt-BR"), FONTS.filial, 26)) return null;
  page.rule(30);
  page.bitmap(SENHA, 18);
  const size = num.length <= 2 ? FONTS.numero2 : num.length === 3 ? FONTS.numero3 : FONTS.numero4;
  if (!line(page, num, size, 26)) return null;
  page.rule(26);
  if (!line(page, dateTimeSP(dto.issuedAt), FONTS.data, 14)) return null;
  page.bitmap(AVISO, 40);
  return escPos(page);
}
