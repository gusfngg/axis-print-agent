import { describe, expect, test } from "vitest";
import { buildServer } from "../src/server";
import { FakePrinterDriver } from "../src/printer-driver";
import type { AgentConfig } from "../src/config";

const SECRET = "a".repeat(64);
const HOST = "127.0.0.1:9101";

/** Sobe o server real (mesmo padrao dos outros testes de rota) com config fake. */
async function buildTestApp(over: Partial<AgentConfig>) {
  const config: AgentConfig = {
    token: "c".repeat(64),
    printerName: "auto",
    printerType: "EPSON",
    characterSet: "PC860_PORTUGUESE",
    allowedOrigins: ["https://app.test"],
    ...over,
  };
  const app = buildServer({ config, printer: new FakePrinterDriver() });
  await app.ready();
  return app;
}

describe("GET /device-credential", () => {
  test("com Origin permitido e secret configurado: 200 com JWS de 60s (nunca o secret cru)", async () => {
    const app = await buildTestApp({ resumeSecret: SECRET });
    const res = await app.inject({
      method: "GET",
      url: "/device-credential",
      headers: { host: HOST, origin: "https://app.test" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { job: string };
    // O segredo cru NUNCA aparece no corpo — é o furo que esta correção fecha.
    expect(res.payload).not.toContain(SECRET);
    expect(body).not.toHaveProperty("secret");

    const parts = body.job.split(".");
    expect(parts).toHaveLength(3);
    const [h, p] = parts as [string, string, string];
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    expect(header.alg).toBe("HS256");
    expect(claims.typ).toBe("axis-kiosk-resume");
    expect(claims.exp - claims.iat).toBe(60);
  });

  test("sem header Origin: 403 (rota de segredo exige Origin — mais estrito que o guard default)", async () => {
    const app = await buildTestApp({ resumeSecret: SECRET });
    const res = await app.inject({ method: "GET", url: "/device-credential", headers: { host: HOST } });
    expect(res.statusCode).toBe(403);
  });

  test("Origin fora da allowlist: 403", async () => {
    const app = await buildTestApp({ resumeSecret: SECRET });
    const res = await app.inject({
      method: "GET",
      url: "/device-credential",
      headers: { host: HOST, origin: "https://evil.test" },
    });
    expect(res.statusCode).toBe(403);
  });

  test("sem resumeSecret no config: 404 NOT_CONFIGURED", async () => {
    const app = await buildTestApp({});
    const res = await app.inject({
      method: "GET",
      url: "/device-credential",
      headers: { host: HOST, origin: "https://app.test" },
    });
    expect(res.statusCode).toBe(404);
  });
});
