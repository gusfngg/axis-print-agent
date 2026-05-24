import { spawn } from "node:child_process";
import { BIND_HOST, PORT } from "./constants";
import { loadOrInitConfig } from "./config";
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

  const app = buildServer({ config, printer });
  await app.listen({ host: BIND_HOST, port: PORT });
  logger.info({ host: BIND_HOST, port: PORT, fake: useFake }, "agent listening");

  let printerOnline = false;
  try {
    printerOnline = await printer.isConnected();
  } catch {
    printerOnline = false;
  }

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
