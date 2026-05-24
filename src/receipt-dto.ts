import { z } from "zod";

/**
 * CONTRATO v1 com o Axis ERP. Cópia byte-a-byte de `src/lib/receipt-dto.ts` do
 * repo Axis. Mudança incompatível exige bump de major do agente + migração
 * coordenada. Divergência é pega no smoke test (Task 15).
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
  }),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(60),
        quantity: z.number().positive().max(99999),
        unitPrice: z.number().nonnegative().max(999999),
        subtotal: z.number().nonnegative().max(9999999),
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
});

export type ReceiptDto = z.infer<typeof ReceiptDto>;

/** Envelope que o hook `useThermalPrint` (Axis) manda no POST /print. */
export const PrintRequest = z.object({ receipt: ReceiptDto });
export type PrintRequest = z.infer<typeof PrintRequest>;
