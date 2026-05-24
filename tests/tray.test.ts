import { describe, it, expect } from "vitest";
import { buildTrayMenu, type AgentStatus } from "../src/tray";

describe("buildTrayMenu", () => {
  it("mostra titulo verde quando tudo ok", () => {
    const status: AgentStatus = { running: true, printerOnline: true };
    const menu = buildTrayMenu(status, "tok");
    expect(menu.title).toContain("online");
    expect(menu.items.some((i) => i.title.includes("Copiar token"))).toBe(true);
  });

  it("sinaliza impressora offline", () => {
    const menu = buildTrayMenu({ running: true, printerOnline: false }, "tok");
    expect(menu.title.toLowerCase()).toContain("impressora");
  });
});
