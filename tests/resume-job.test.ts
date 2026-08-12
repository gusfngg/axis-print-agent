import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { RESUME_JOB_TYP, signResumeJob } from "../src/resume-job";

const SECRET = "a".repeat(64);
const NOW_MS = Date.UTC(2026, 7, 12, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

/** Recalcula a assinatura como o Axis fará: HMAC-SHA256(secret, "header.payload"). */
function reverify(compact: string, secret: string) {
  const [h, p, sig] = compact.split(".") as [string, string, string];
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const provided = Buffer.from(sig, "base64url");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

describe("signResumeJob (fix ALTO 2026-08-12)", () => {
  it("assina um JWS de 3 partes com header HS256/JWT", () => {
    const parts = signResumeJob(SECRET, NOW_MS).split(".");
    expect(parts).toHaveLength(3);
    const [h] = parts as [string, string, string];
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("emite claims com typ do resume, jti de 16 bytes hex, iat e exp = iat + 60", () => {
    const [, p] = signResumeJob(SECRET, NOW_MS).split(".") as [string, string, string];
    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    expect(claims.typ).toBe(RESUME_JOB_TYP);
    expect(claims.iat).toBe(NOW_S);
    expect(claims.exp).toBe(NOW_S + 60);
    expect(claims.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it("round-trip: a assinatura confere com o MESMO segredo (o que o Axis fará)", () => {
    expect(reverify(signResumeJob(SECRET, NOW_MS), SECRET)).toBe(true);
  });

  it("um segredo diferente NÃO valida a assinatura", () => {
    expect(reverify(signResumeJob(SECRET, NOW_MS), "b".repeat(64))).toBe(false);
  });

  it("jti é único a cada chamada (anti-replay do lado do Axis)", () => {
    const jti = (compact: string) => {
      const [, p] = compact.split(".") as [string, string, string];
      return JSON.parse(Buffer.from(p, "base64url").toString("utf8")).jti;
    };
    expect(jti(signResumeJob(SECRET))).not.toBe(jti(signResumeJob(SECRET)));
  });
});
