const REDACTED = "[REDACTED]";

/** Campos cujo VALOR é sempre redatado. Subconjunto relevante do Axis. */
export const DENY_FIELDS = new Set<string>([
  "password", "passwordHash", "pin", "pinHash", "pinLookup", "secret",
  "cpfCnpj", "cpf", "cnpj", "rg",
  "email", "phone", "phoneNumber",
  "jwt", "token", "Authorization", "authorization", "Cookie", "cookie",
  "cardNumber", "pan", "cvv",
]);

const CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CNPJ_REGEX = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const JWT_REGEX = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

function scrubString(s: string): string {
  return s.replace(JWT_REGEX, REDACTED).replace(CPF_REGEX, REDACTED).replace(CNPJ_REGEX, REDACTED);
}

/** Redact recursivo. Não muta o original. */
export function scrubPII<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (typeof value === "string") return scrubString(value) as unknown as T;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubPII(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = DENY_FIELDS.has(k) ? REDACTED : scrubPII(v);
  }
  return out as T;
}
