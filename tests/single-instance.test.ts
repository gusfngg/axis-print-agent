// tests/single-instance.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { isHealthyAgentRunning } from "../src/single-instance";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

describe("isHealthyAgentRunning", () => {
  it("true quando /health responde ok com version", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, version: "1.0.0" }), { status: 200 })) as any;
    expect(await isHealthyAgentRunning()).toBe(true);
  });
  it("false quando /health responde nao-ok", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as any;
    expect(await isHealthyAgentRunning()).toBe(false);
  });
  it("false quando o fetch lanca (porta tomada por outro processo)", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as any;
    expect(await isHealthyAgentRunning()).toBe(false);
  });
});
