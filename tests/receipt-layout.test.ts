// tests/receipt-layout.test.ts
import { describe, it, expect } from "vitest";
import { buildReceiptOps } from "../src/receipt-layout";
import type { ReceiptDto } from "../src/receipt-dto";

const base: ReceiptDto = {
  saleNumber: "VEN-00042",
  createdAt: "2026-05-24T15:30:00.000Z",
  branch: { name: "Super Auto", address: "Rua X, 1", city: "Goiania", state: "GO", phone: "(62) 3000-0000" },
  items: [{ description: "Filtro", quantity: 1, unitPrice: 10, subtotal: 10 }],
  subtotal: 10,
  discount: 0,
  total: 10,
  payment: { method: "DINHEIRO" },
  footerMessage: "Obrigado",
  reprint: false,
};

const texts = (ops: ReturnType<typeof buildReceiptOps>) =>
  ops.filter((o) => o.op === "text").map((o) => (o as { v: string }).v).join("|");

describe("buildReceiptOps", () => {
  it("inclui banner de 2a via quando reprint=true", () => {
    expect(texts(buildReceiptOps({ ...base, reprint: true }))).toContain("2a VIA");
    expect(texts(buildReceiptOps({ ...base, reprint: false }))).not.toContain("2a VIA");
  });

  it("sanitiza ESC/POS na descricao do item", () => {
    // ESC (0x1B) e removido pela sanitizeText; '@' (0x40) e imprimivel e preservado.
    const ops = buildReceiptOps({ ...base, items: [{ description: "Mal\x1B@icioso", quantity: 1, unitPrice: 1, subtotal: 1 }] });
    expect(texts(ops)).toContain("Mal@icioso");
    expect(texts(ops)).not.toContain("\x1B");
  });

  it("omite linha de desconto quando 0 e inclui quando > 0", () => {
    const noDisc = buildReceiptOps(base).filter((o) => o.op === "leftRight") as Array<{ l: string }>;
    expect(noDisc.some((o) => o.l === "Desconto")).toBe(false);
    const withDisc = buildReceiptOps({ ...base, discount: 5 }).filter((o) => o.op === "leftRight") as Array<{ l: string }>;
    expect(withDisc.some((o) => o.l === "Desconto")).toBe(true);
  });

  it("inclui bloco TEF so quando presente", () => {
    expect(texts(buildReceiptOps(base))).not.toContain("NSU");
    const tef = buildReceiptOps({ ...base, payment: { method: "CARTAO_CREDITO", tef: { nsu: "999", authCode: "A1", brand: "VISA" } } });
    expect(texts(tef)).toContain("999");
    expect(texts(tef)).toContain("VISA");
  });

  it("sempre termina com cut", () => {
    const ops = buildReceiptOps(base);
    expect(ops[ops.length - 1]!.op).toBe("cut");
  });

  it("sem bloco fiscal nao imprime QR Code (notinha de caixa segue v1)", () => {
    expect(buildReceiptOps(base).some((o) => o.op === "qrcode")).toBe(false);
    expect(texts(buildReceiptOps(base))).not.toContain("DANFE");
  });
});

// ── DANFE NFC-e ──────────────────────────────────────────────────────────────

const CHAVE = "35260812345678000190650010000081231234567890";
const QR = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE}|2|1|1|ABCDEF0123456789`;

const fiscal: NonNullable<ReceiptDto["fiscal"]> = {
  qrCode: QR,
  chaveAcesso: CHAVE,
  numero: "8123",
  serie: "1",
  protocolo: "135260000123456",
  autorizadaEm: "2026-08-06T13:00:05.000Z",
  urlConsulta: "www.nfce.fazenda.sp.gov.br/consulta",
  tributos: 12.34,
  ambiente: "producao",
};

const danfe = (over: Partial<NonNullable<ReceiptDto["fiscal"]>> = {}) =>
  buildReceiptOps({ ...base, fiscal: { ...fiscal, ...over } });

describe("buildReceiptOps — DANFE NFC-e", () => {
  it("identifica o documento e imprime o QR com o texto EXATO do XML", () => {
    const ops = danfe();
    expect(texts(ops)).toContain("DANFE NFC-e");
    const qr = ops.filter((o) => o.op === "qrcode") as Array<{ v: string }>;
    expect(qr).toHaveLength(1);
    // O conteúdo é assinado pelo CSC: alterar um byte invalida a consulta.
    expect(qr[0]!.v).toBe(QR);
  });

  it("imprime a chave em grupos de 4 (caminho de consulta quando o QR nao le)", () => {
    expect(texts(danfe())).toContain("3526 0812 3456 7800 0190");
  });

  it("declara os tributos da Lei 12.741 quando informados", () => {
    expect(texts(danfe())).toContain("12.741");
    const semTributo = { ...fiscal };
    delete semTributo.tributos;
    expect(texts(buildReceiptOps({ ...base, fiscal: semTributo }))).not.toContain("12.741");
  });

  it("consumidor: identificado quando informado, generico quando nao", () => {
    expect(texts(danfe({ consumidor: "CPF 123.456.789-00" }))).toContain("123.456.789-00");
    expect(texts(danfe())).toContain("CONSUMIDOR NAO IDENTIFICADO");
  });

  it("estampa o aviso obrigatorio em homologacao — e so nela", () => {
    expect(texts(danfe({ ambiente: "homologacao" }))).toContain("SEM VALOR FISCAL");
    expect(texts(danfe())).not.toContain("SEM VALOR FISCAL");
  });

  it("rodape sai em quad negrito e volta ao normal antes do corte", () => {
    const ops = buildReceiptOps({ ...base, footerMessage: "AUTOATENDIMENTO", fiscal });
    const i = ops.findIndex((o) => o.op === "text" && o.v === "AUTOATENDIMENTO");
    expect(ops.slice(i - 2, i)).toEqual([{ op: "bold", v: true }, { op: "size", v: "quad" }]);
    expect(ops.slice(i + 1, i + 3)).toEqual([{ op: "size", v: "normal" }, { op: "bold", v: false }]);
  });

  it("comanda do SIAC (v1.2): CODE128 do numero do pedido DEPOIS do rodape, antes do corte", () => {
    const ops = buildReceiptOps({ ...base, footerMessage: "AUTOATENDIMENTO", fiscal, comanda: { numero: "2529103" } });
    const iRodape = ops.findIndex((o) => o.op === "text" && o.v === "AUTOATENDIMENTO");
    const iBarra = ops.findIndex((o) => o.op === "barcode");
    expect(ops[iBarra]).toEqual({ op: "barcode", v: "2529103" });
    expect(iBarra).toBeGreaterThan(iRodape);
    expect(iBarra).toBeGreaterThan(ops.findIndex((o) => o.op === "qrcode"));
    expect(texts(ops)).toContain("Pedido 2529103");
    expect(texts(ops)).toContain("TODOS OS ITENS PASSAM NA CONFERENCIA");
    expect(ops[ops.length - 1]!.op).toBe("cut");
  });

  it("sem comanda nao imprime codigo de barras (Axis antigo / venda sem pedido)", () => {
    expect(danfe().some((o) => o.op === "barcode")).toBe(false);
  });

  it("mantem 2a via e corte", () => {
    const ops = buildReceiptOps({ ...base, reprint: true, fiscal });
    expect(texts(ops)).toContain("2a VIA");
    expect(ops[ops.length - 1]!.op).toBe("cut");
  });
});
