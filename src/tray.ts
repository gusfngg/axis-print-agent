import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
 * Lê `assets/tray.ico` como base64 pro `icon` do SysTray.
 * Nunca lança: se o arquivo sumir (build sem o asset), devolve "" e o tray sobe sem ícone.
 * NOTA: o `tray.ico` atual é um placeholder (16x16 sólido) — trocar por branding real.
 */
function loadTrayIconBase64(): string {
  // Em dev/tsx o bundle fica em dist/ ou o módulo em src/; no exe (pkg) os assets
  // ficam relativos ao snapshot. Tenta ao lado do módulo (../assets) e, por último, o cwd.
  // __dirname é seguro no bundle CJS (tsup) e em runtime Node.
  const candidates = [
    path.join(__dirname, "..", "assets", "tray.ico"),
    path.join(__dirname, "assets", "tray.ico"),
    path.join(process.cwd(), "assets", "tray.ico"),
  ];
  for (const file of candidates) {
    try {
      return readFileSync(file).toString("base64");
    } catch {
      // tenta o próximo candidato
    }
  }
  return "";
}

/**
 * Wiring real do systray2. Mantido fino e fora dos testes (ícone é visual).
 * `onOpenHealth` é chamado quando o usuário clica "Abrir /health".
 */
export async function startTray(getStatus: () => AgentStatus, token: string, onOpenHealth: () => void): Promise<void> {
  const SysTray = (await import("systray2")).default;
  const icon = loadTrayIconBase64();
  const menu = buildTrayMenu(getStatus(), token);
  const trayItems = menu.items.map((i) => ({ title: i.title, tooltip: i.title, enabled: true, checked: false }));
  const tray = new SysTray({
    menu: {
      icon,
      title: menu.title,
      tooltip: menu.tooltip,
      items: trayItems,
    },
    debug: false,
    // caminho absoluto gravável — systray2 spawna o binário de fora do snapshot do pkg.
    copyDir: path.join(os.tmpdir(), "axis-print-tray"),
  });
  tray.onClick((action: { seq_id: number }) => {
    const item = menu.items[action.seq_id];
    if (!item) return;
    if (item.action === "copy-token") copyToClipboard(token);
    else if (item.action === "open-health") onOpenHealth();
    else if (item.action === "quit") { tray.kill(); process.exit(0); }
  });
  await tray.ready();

  // Status ao vivo: relê getStatus() a cada 30s e atualiza o título do tray.
  // O sendAction (API systray2 de runtime) só dá pra validar no Windows (Task 6).
  let lastTitle = menu.title;
  const refresh = setInterval(() => {
    const next = buildTrayMenu(getStatus(), token);
    if (next.title === lastTitle) return;
    lastTitle = next.title;
    void tray
      .sendAction({ type: "update-menu", seq_id: -1, menu: { icon, title: next.title, tooltip: next.tooltip, items: trayItems } })
      .catch(() => {
        // falha de atualização do tray não é fatal — o agente segue imprimindo.
      });
  }, 30_000);
  refresh.unref();
}
