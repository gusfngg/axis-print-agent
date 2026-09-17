import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { registerPaygoWindowRoute } from "../src/routes/paygo-window";
import { makeRequireAuth } from "../src/auth-hook";
import { receiptFingerprint } from "../src/print-job";

const TOKEN = "b".repeat(64);
const SHOW = { kind: "paygo-window", show: true };
const HIDE = { kind: "paygo-window", show: false };

const job = (subject: unknown) => {
  const nowS = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(
    JSON.stringify({ typ: "axis-print-job", jti: crypto.randomBytes(8).toString("hex"), iat: nowS, exp: nowS + 60, sub: receiptFingerprint(subject) }),
  ).toString("base64url");
  const s = crypto.createHmac("sha256", TOKEN).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
};

let app: FastifyInstance;
let dir: string;
const flag = () => path.join(dir, "show.flag");

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "axis-helper-"));
  app = Fastify();
  registerPaygoWindowRoute(app, { requireAuth: makeRequireAuth(() => TOKEN), kioskHelperDir: dir, autoHideMs: 60 });
  await app.ready();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const post = (auth: string | null, command: unknown) =>
  app.inject({
    method: "POST",
    url: "/paygo-window",
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
    payload: { command },
  });

describe("POST /paygo-window", () => {
  it("401 sem credencial — nao cria o flag", async () => {
    expect((await post(null, SHOW)).statusCode).toBe(401);
    expect(fs.existsSync(flag())).toBe(false);
  });

  it("show:true cria show.flag com job assinado sobre o comando (token estatico tambem serve)", async () => {
    const res = await post(job(SHOW), SHOW);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, show: true, autoHideMs: 60 });
    expect(fs.existsSync(flag())).toBe(true);
    expect((await post(TOKEN, HIDE)).statusCode).toBe(200);
    expect(fs.existsSync(flag())).toBe(false);
  });

  it("job de show:true NAO serve para show:false (preso ao comando)", async () => {
    const res = await post(job(SHOW), HIDE);
    expect(res.statusCode).toBe(401);
  });

  it("400 com comando fora do contrato", async () => {
    expect((await post(TOKEN, { kind: "paygo-window", show: "sim" })).statusCode).toBe(400);
    expect((await post(TOKEN, { kind: "outro", show: true })).statusCode).toBe(400);
  });

  it("corpo com receipt + command (job assinado sobre o receipt) → 401 — nao executa o comando", async () => {
    const receipt = { saleNumber: "X" };
    const res = await app.inject({
      method: "POST",
      url: "/paygo-window",
      headers: { authorization: `Bearer ${job(receipt)}` },
      payload: { receipt, command: SHOW },
    });
    expect(res.statusCode).toBe(401);
    expect(fs.existsSync(flag())).toBe(false);
  });

  it("envelope com campo extra e token estatico → 400 (strict no envelope)", async () => {
    const res = await post(TOKEN, SHOW);
    expect(res.statusCode).toBe(200);
    const extra = await app.inject({
      method: "POST",
      url: "/paygo-window",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { command: HIDE, receipt: { saleNumber: "X" } },
    });
    expect(extra.statusCode).toBe(400);
  });

  it("flag pre-existente e' apagado no registro da rota (fail-closed no boot)", async () => {
    fs.writeFileSync(flag(), "");
    const app2 = Fastify();
    registerPaygoWindowRoute(app2, { requireAuth: makeRequireAuth(() => TOKEN), kioskHelperDir: dir });
    await app2.ready();
    expect(fs.existsSync(flag())).toBe(false);
  });

  it("auto-esconde depois de autoHideMs", async () => {
    await post(TOKEN, SHOW);
    expect(fs.existsSync(flag())).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    expect(fs.existsSync(flag())).toBe(false);
  });
});
