// tests/origin-guard.test.ts
import { describe, it, expect, vi } from "vitest";
import { makeOriginGuard } from "../src/origin-guard";

const ALLOWED = ["https://axis-erp.vercel.app", "http://localhost:3000"];

function fakeReq(opts: { method?: string; host?: string; origin?: string; pna?: boolean }) {
  const headers: Record<string, string> = {};
  if (opts.host !== undefined) headers["host"] = opts.host;
  if (opts.origin !== undefined) headers["origin"] = opts.origin;
  if (opts.pna) headers["access-control-request-private-network"] = "true";
  return { method: opts.method ?? "POST", headers };
}

function fakeReply() {
  const headers: Record<string, string> = {};
  const reply: any = {
    statusCode: 200,
    sent: false,
    header: vi.fn((k: string, v: string) => { headers[k.toLowerCase()] = v; return reply; }),
    code: vi.fn((c: number) => { reply.statusCode = c; return reply; }),
    send: vi.fn(() => { reply.sent = true; return reply; }),
    _headers: headers,
  };
  return reply;
}

describe("originGuard (Camada 2)", () => {
  const guard = makeOriginGuard(ALLOWED);

  it("403 quando o Host nao e loopback:9101", async () => {
    const reply = fakeReply();
    await guard(fakeReq({ host: "evil.com" }) as any, reply as any);
    expect(reply.statusCode).toBe(403);
    expect(reply.sent).toBe(true);
  });

  it("403 quando a Origin nao esta na allow-list", async () => {
    const reply = fakeReply();
    await guard(fakeReq({ host: "127.0.0.1:9101", origin: "http://evil.com" }) as any, reply as any);
    expect(reply.statusCode).toBe(403);
  });

  it("ecoa ACAO pra origem permitida em POST", async () => {
    const reply = fakeReply();
    await guard(fakeReq({ host: "127.0.0.1:9101", origin: "https://axis-erp.vercel.app" }) as any, reply as any);
    expect(reply.sent).toBe(false); // segue pro handler
    expect(reply._headers["access-control-allow-origin"]).toBe("https://axis-erp.vercel.app");
  });

  it("responde preflight OPTIONS 204 com header PNA quando solicitado", async () => {
    const reply = fakeReply();
    await guard(fakeReq({ method: "OPTIONS", host: "127.0.0.1:9101", origin: "https://axis-erp.vercel.app", pna: true }) as any, reply as any);
    expect(reply.statusCode).toBe(204);
    expect(reply.sent).toBe(true);
    expect(reply._headers["access-control-allow-private-network"]).toBe("true");
    expect(reply._headers["access-control-allow-headers"]).toContain("authorization");
  });

  it("permite GET sem Origin (navegacao direta ao /health) quando Host ok", async () => {
    const reply = fakeReply();
    await guard(fakeReq({ method: "GET", host: "localhost:9101" }) as any, reply as any);
    expect(reply.sent).toBe(false);
  });
});
