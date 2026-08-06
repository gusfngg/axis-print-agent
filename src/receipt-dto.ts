import { z } from "zod";

/**
 * CONTRATO v1 com o Axis ERP. Cópia byte-a-byte de `src/lib/receipt-dto.ts` do
 * repo Axis. Mudança incompatível exige bump de major do agente + migração
 * coordenada. Divergência é pega no smoke test (Task 15).
 *
 * **v1.1 (2026-08-06) — DANFE NFC-e.** Tudo que entrou é OPCIONAL, de propósito:
 * Axis antigo continua imprimindo no agente novo, e a presença do bloco `fiscal`
 * é o que distingue o cupom fiscal do totem da notinha não-fiscal do caixa. Por
 * ser aditivo NÃO houve bump de major — só de minor.
 */
export const ReceiptDto = z.object({
  saleNumber: z.string().regex(/^VEN-\d{5,}$/),
  createdAt: z.string().datetime(),
  branch: z.object({
    name: z.string().min(1).max(80),
    address: z.string().max(120),
    city: z.string().max(60),
    state: z.string().length(2),
    phone: z.string().max(20),
    /** CNPJ formatado do emitente. Obrigatório no DANFE, ausente na notinha. */
    cnpj: z.string().max(20).optional(),
  }),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(60),
        quantity: z.number().positive().max(99999),
        unitPrice: z.number().nonnegative().max(999999),
        subtotal: z.number().nonnegative().max(9999999),
        /** `cProd` — o DANFE exige código do produto por item. */
        code: z.string().max(20).optional(),
        /** `uCom` (UN, PC, LT…). Default de exibição: "UN". */
        unit: z.string().max(6).optional(),
      }),
    )
    .min(1)
    .max(200),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative(),
  total: z.number().nonnegative(),
  payment: z.object({
    method: z.enum([
      "DINHEIRO",
      "PIX",
      "CARTAO_CREDITO",
      "CARTAO_DEBITO",
      "CREDIARIO",
      "TRANSFERENCIA",
    ]),
    tef: z
      .object({
        nsu: z.string().max(20),
        authCode: z.string().max(20),
        brand: z.string().max(20),
      })
      .optional(),
  }),
  footerMessage: z.string().max(120),
  reprint: z.boolean(),
  /**
   * Presente ⇒ imprime **DANFE NFC-e** (documento auxiliar da nota autorizada)
   * em vez da notinha de caixa. Ausente ⇒ layout v1, intocado.
   *
   * Os valores vêm do XML autorizado, nunca do cliente: `qrCode` é o conteúdo
   * de `infNFeSupl/qrCode` — **assinado pelo CSC do CNPJ da loja**, e é ele que
   * a SEFAZ valida na leitura. Reescrever/reconstruir esse texto invalida a
   * consulta; o agente só o repassa ao módulo de QR da impressora.
   */
  fiscal: z
    .object({
      qrCode: z.string().min(1).max(1000),
      chaveAcesso: z.string().regex(/^\d{44}$/),
      /** `nNF` e `serie` — o DANFE identifica a nota por eles, não pelo pedido. */
      numero: z.string().max(9),
      serie: z.string().max(3),
      /** `nProt` da autorização + quando a SEFAZ autorizou (`dhRecbto`). */
      protocolo: z.string().max(20).optional(),
      autorizadaEm: z.string().datetime().optional(),
      /** `infNFeSupl/urlChave` — onde consultar a nota pela chave. */
      urlConsulta: z.string().max(120).optional(),
      /** `vTotTrib` — Lei 12.741/2012 exige o valor no documento. */
      tributos: z.number().nonnegative().optional(),
      /** Já formatado ("CPF 123.456.789-00"); ausente = não identificado. */
      consumidor: z.string().max(40).optional(),
      /**
       * `tpAmb`. Em homologação o DANFE é obrigado a estampar que não tem valor
       * fiscal — sem isso, um cupom de teste passa por nota de verdade.
       */
      ambiente: z.enum(["producao", "homologacao"]).optional(),
    })
    .optional(),
});

export type ReceiptDto = z.infer<typeof ReceiptDto>;

/** Envelope que o hook `useThermalPrint` (Axis) manda no POST /print. */
export const PrintRequest = z.object({ receipt: ReceiptDto });
export type PrintRequest = z.infer<typeof PrintRequest>;
