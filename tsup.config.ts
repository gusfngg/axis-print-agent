import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["cjs"],
  target: "node20",
  platform: "node",
  bundle: true,
  outExtension: () => ({ js: ".cjs" }),
  // Nativos e o helper binario do tray ficam fora do bundle; o pkg empacota via assets.
  external: ["@thiagoelg/node-printer", "node-thermal-printer", "systray2"],
  define: {
    "process.env.AGENT_BUILD": JSON.stringify(process.env.AGENT_BUILD ?? "dev"),
  },
  clean: true,
});
