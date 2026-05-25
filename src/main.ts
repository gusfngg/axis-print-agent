import { spawn } from "node:child_process";
import { BIND_HOST, PORT } from "./constants";
import { loadOrInitConfig, wasConfigSelfHealed } from "./config";
import { buildServer } from "./server";
import { logger } from "./logger";
import { FakePrinterDriver, type PrinterDriver } from "./printer-driver";

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.error({ err: err.message }, "uncaughtException");
});

async function main(): Promise<void> {
  const useFake = process.argv.includes("--fake");
  const noTray = process.argv.includes("--no-tray");
  const config = loadOrInitConfig();

  let printer: PrinterDriver;
  if (useFake) {
    printer = new FakePrinterDriver();
  } else {
    const { NodeThermalPrinterDriver } = await import("./printer.js");
    printer = new NodeThermalPrinterDriver(config);
  }

  const app = buildServer({ config, printer, configError: wasConfigSelfHealed() });
  try {
    await app.listen({ host: BIND_HOST, port: PORT });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      const { isHealthyAgentRunning } = await import("./single-instance.js");
      if (await isHealthyAgentRunning()) {
        logger.info({ port: PORT }, "agent already running — exiting cleanly");
        process.exit(0);
      }
      logger.error({ port: PORT }, "port in use by a non-agent process");
    } else {
      logger.error({ err: (err as Error).message }, "listen failed");
    }
    process.exit(1);
  }
  logger.info({ host: BIND_HOST, port: PORT, fake: useFake }, "agent listening");

  // Status da impressora consultado ao vivo: lido no boot e refrescado a cada 30s.
  // O closure passado ao tray lê esta var por referência, então o título reflete o estado atual.
  let printerOnline = false;
  const refreshPrinterStatus = async (): Promise<void> => {
    try {
      printerOnline = await printer.isConnected();
    } catch {
      printerOnline = false;
    }
  };
  await refreshPrinterStatus();

  const POLL_MS = 30_000;
  const poll = setInterval(() => {
    void refreshPrinterStatus();
  }, POLL_MS);
  poll.unref();

  if (!noTray) {
    const { startTray } = await import("./tray.js");
    await startTray(
      () => ({ running: true, printerOnline }),
      config.token,
      () => {
        const url = `http://${BIND_HOST}:${PORT}/health`;
        const opener = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
        const child = spawn(opener, [url], { stdio: "ignore", detached: true });
        child.on("error", () => {});
        child.unref();
      },
    ).catch((err: unknown) => logger.error({ err: (err as Error).message }, "tray failed (continuando headless)"));
  }
}

main().catch((err: unknown) => {
  console.error("fatal:", err);
  process.exit(1);
});
