import { spawn } from "node:child_process";

export interface AgentStatus {
  running: boolean;
  printerOnline: boolean;
}

export interface TrayMenu {
  title: string;
  tooltip: string;
  items: Array<{ title: string; action: "copy-token" | "open-health" | "quit" }>;
}

/** Puro: decide o título/itens do tray a partir do status. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- _token mantido na assinatura por simetria com startTray; não usado aqui.
export function buildTrayMenu(status: AgentStatus, _token: string): TrayMenu {
  let title: string;
  if (!status.running) title = "Agente com erro";
  else if (!status.printerOnline) title = "online — impressora offline";
  else title = "online";
  return {
    title,
    tooltip: "Axis Print Agent",
    items: [
      { title: "Copiar token de pareamento", action: "copy-token" },
      { title: "Abrir /health", action: "open-health" },
      { title: "Sair", action: "quit" },
    ],
  };
}

/** Copia texto pro clipboard sem dep extra (clip no Windows, pbcopy no macOS). */
export function copyToClipboard(text: string): void {
  const cmd = process.platform === "win32" ? "clip" : process.platform === "darwin" ? "pbcopy" : "xclip";
  const args = process.platform === "linux" ? ["-selection", "clipboard"] : [];
  try {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => {});
    child.stdin.end(text);
  } catch {
    // tray sem clipboard não é fatal — o token também está no config.json
  }
}

/**
 * Wiring real do systray2. Mantido fino e fora dos testes (ícone é visual).
 * `onOpenHealth` é chamado quando o usuário clica "Abrir /health".
 */
export async function startTray(getStatus: () => AgentStatus, token: string, onOpenHealth: () => void): Promise<void> {
  const SysTray = (await import("systray2")).default;
  const menu = buildTrayMenu(getStatus(), token);
  const tray = new SysTray({
    menu: {
      // ícone base64 — substituir por .ico real no Sprint C.
      icon: "",
      title: menu.title,
      tooltip: menu.tooltip,
      items: menu.items.map((i) => ({ title: i.title, tooltip: i.title, enabled: true, checked: false })),
    },
    debug: false,
    copyDir: true,
  });
  tray.onClick((action: { seq_id: number }) => {
    const item = menu.items[action.seq_id];
    if (!item) return;
    if (item.action === "copy-token") copyToClipboard(token);
    else if (item.action === "open-health") onOpenHealth();
    else if (item.action === "quit") { tray.kill(); process.exit(0); }
  });
  await tray.ready();
}
