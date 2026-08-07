import { defineConfig } from "tsup";
import pkg from "./package.json";

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
    // A versao sai do package.json, NUNCA de uma constante mantida a mao: ficou
    // travada em "1.0.0" da v1.0.0 ate a v1.2.0 porque bumpar os dois lugares
    // era disciplina humana. O /health mentia justo o campo usado pra conferir
    // se o totem pegou a build nova — e um comentario pedindo "bumpar junto" ja
    // existia e nao impediu a repeticao.
    "process.env.AGENT_VERSION": JSON.stringify(pkg.version),
  },
  clean: true,
});
