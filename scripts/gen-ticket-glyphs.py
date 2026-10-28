# Gera src/ticket-glyphs.ts: os bitmaps 1-bit do cupom de senha (logo, textos fixos e as letras e
# digitos de cada estilo) a partir da fonte Archivo (OFL, a do site da Super Auto) e do logo.
# O agente monta o cupom em imagem com isso (ticket-raster.ts), sem lib de fonte no Windows.
# Uso: python3 scripts/gen-ticket-glyphs.py <Archivo[wdth,wght].ttf> <auto-logo-wordmark.png> src/ticket-glyphs.ts
import base64
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps

FONT, LOGO, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
THRESHOLD = 140  # cinza abaixo disso vira ponto preto
UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÉÊÍÓÔÕÚÜÇ0123456789 -./"


def font(size, wght, wdth=100):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([wght, wdth])  # eixos do Archivo: Weight, Width
    return f


def ink(im):  # bbox da tinta (pixels escuros) de uma imagem "L"
    return ImageOps.invert(im).point(lambda p: 255 if p > 255 - THRESHOLD else 0).getbbox()


def pack(im):  # "L" -> linhas MSB-first, 1 = preto, ceil(w/8) bytes por linha
    w, h = im.size
    bpr = (w + 7) // 8
    out = bytearray(bpr * h)
    px = im.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] < THRESHOLD:
                out[y * bpr + x // 8] |= 0x80 >> (x % 8)
    return base64.b64encode(bytes(out)).decode()


def fixed(im):
    im = im.crop(ink(im))
    return {"w": im.width, "h": im.height, "b": pack(im)}


def text_bitmap(text, f):
    im = Image.new("L", (int(f.getlength(text)) + f.size, f.size * 2), 255)
    ImageDraw.Draw(im).text((f.size // 2, f.size), text, font=f, fill=0, anchor="ls")
    return fixed(im)


def style(f, chars):
    asc, desc = f.getmetrics()
    pad = f.size // 3
    raw = {}
    for ch in chars:
        adv = round(f.getlength(ch))
        im = Image.new("L", (adv + 2 * pad, asc + desc), 255)
        ImageDraw.Draw(im).text((pad, asc), ch, font=f, fill=0, anchor="ls")
        raw[ch] = (im, adv, ink(im))
    boxes = [b for _, _, b in raw.values() if b]
    top, bottom = min(b[1] for b in boxes), max(b[3] for b in boxes)  # faixa comum: mesma linha de base
    glyphs = {}
    for ch, (im, adv, b) in raw.items():
        x0, x1 = (b[0], b[2]) if b else (pad, pad)
        cell = im.crop((x0, top, x1, bottom))
        glyphs[ch] = {"w": x1 - x0, "x": x0 - pad, "a": adv, "b": pack(cell) if x1 > x0 else ""}
    return {"h": bottom - top, "glyphs": glyphs}


logo = Image.open(LOGO).convert("RGBA")
lw = 380
logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
bg = Image.new("RGBA", logo.size, (255, 255, 255, 255))
bg.alpha_composite(logo)

data = {
    "LOGO": fixed(bg.convert("L")),
    "SENHA": text_bitmap("SENHA", font(34, 600, 125)),
    "AVISO": text_bitmap("Aguarde ser chamado no painel", font(28, 500)),
    "FONTS": {
        "filial": style(font(30, 700, 110), UPPER),
        # O maior tamanho que cabe em 496 px (80 mm menos as margens) com os digitos mais largos.
        "numero2": style(font(240, 900, 125), "0123456789"),
        "numero3": style(font(195, 900, 125), "0123456789"),
        "numero4": style(font(145, 900, 125), "0123456789"),
        "data": style(font(30, 500), "0123456789/: "),
    },
}


def ts(v, ind=""):
    if isinstance(v, dict):
        inner = ",\n".join(f'{ind}  {k if k.isidentifier() else repr(k)}: {ts(x, ind + "  ")}' for k, x in v.items())
        return "{\n" + inner + "\n" + ind + "}"
    return repr(v) if isinstance(v, str) else str(v)


with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("// GERADO por scripts/gen-ticket-glyphs.py (fonte Archivo, OFL) - nao editar a mao.\n")
    fh.write("// Bitmaps 1-bit em base64: linhas MSB-first, ceil(w/8) bytes por linha, 1 = ponto preto.\n")
    fh.write("export interface Bitmap { w: number; h: number; b: string }\n")
    fh.write("/** w = largura da tinta, x = deslocamento da tinta a partir da caneta, a = avanço. */\n")
    fh.write("export interface Glyph { w: number; x: number; a: number; b: string }\n")
    fh.write("export interface GlyphStyle { h: number; glyphs: Record<string, Glyph> }\n")
    for name in ("LOGO", "SENHA", "AVISO"):
        fh.write(f"export const {name}: Bitmap = {ts(data[name])};\n")
    fh.write(f"export const FONTS: Record<'filial' | 'numero2' | 'numero3' | 'numero4' | 'data', GlyphStyle> = {ts(data['FONTS'])};\n")
print("ok", OUT)
