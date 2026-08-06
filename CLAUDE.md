# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Agente local (Node 20 + Fastify) que roda na máquina do caixa/totem Windows, escuta em
`127.0.0.1:9101` e imprime a **notinha de caixa** (não-fiscal, ESC/POS 80mm) pelo spooler do
Windows. O web app Axis manda o `ReceiptDto` via `POST /print`; se o agente estiver offline,
o Axis cai no `window.print()` do navegador. Distribuído como `.exe` único (pkg).

## Comandos

```bash
npm run dev -- --fake --no-tray   # dev fora do Windows: driver falso, sem tray
npm test                          # vitest run
npx vitest run tests/print-route.test.ts   # um arquivo só
npx vitest run -t "nome do teste"          # um teste só
npm run typecheck                 # tsc --noEmit
npm run lint
npm run build:exe                 # tsup + pkg → dist/axis-print-agent.exe (só faz sentido no Windows)
```

Release: push de tag `v*.*.*` → workflow `release.yml` builda no **windows-2022** (pin
deliberado, ver comentário no yml), roda testes, gera o `.exe`, faz smoke test de boot+`/health`,
carimba o SHA-256 dentro do `install.bat` e publica o zip.

## Contrato com o Axis (NÃO QUEBRAR)

- `POST /print` (Bearer) · `{ receipt: ReceiptDto }` → `200 {ok,durationMs}` / `400 INVALID_PAYLOAD` / `503 PRINTER_OFFLINE|PRINT_FAILED`
- `GET /health` (sem Bearer) → `{ ok, version, build, printer:{name,online}, uptimeSec, configError? }`
- `GET /printers` (Bearer) → `{ printers: string[] }`
- `POST /config` (Bearer) · `{ printerName }` → seta impressora e persiste
- `src/receipt-dto.ts` é **cópia byte-a-byte** de `src/lib/receipt-dto.ts` do repo Axis.
  Contrato v1: mudança incompatível exige bump de major + migração coordenada dos dois lados.
- **v1.1 (agente 1.1.0) — DANFE NFC-e.** Os campos novos são todos OPCIONAIS: `branch.cnpj`,
  `items[].code`, `items[].unit` e o bloco `fiscal` (`qrCode`, `chaveAcesso`, `numero`, `serie`,
  `protocolo?`, `autorizadaEm?`, `urlConsulta?`, `tributos?`, `consumidor?`, `ambiente?`).
  **`fiscal` presente ⇒ DANFE; ausente ⇒ notinha de caixa v1, idêntica à de antes.** Logo o
  agente 1.1.0 imprime payload de Axis antigo, e Axis novo cai no layout v1 se o agente for
  velho (o Zod dele ignora campo desconhecido) — **a ordem de deploy é indiferente**.
  - **`fiscal.qrCode` NÃO é sanitizado nem reconstruído**: é o texto assinado pelo CSC do CNPJ
    da loja e a SEFAZ confere essa assinatura na leitura. Só se repassa ao módulo de QR.
  - `ambiente: "homologacao"` obriga o carimbo "SEM VALOR FISCAL" no cupom.

## Arquitetura

Fluxo: `main.ts` (config → driver → server → listen → tray) → `server.ts` monta as camadas →
`routes/*` → `PrinterDriver` → `receipt-layout` (ops puras) → `node-thermal-printer`.

**Camadas de defesa numeradas nos comentários do código** (`Camada 1..6`) — é o vocabulário do
repo, mantenha-o ao mexer em segurança:

1. bind hardcoded em `127.0.0.1` (`constants.ts`) — mudar quebra `tests/bind-localhost.test.ts`
2. `origin-guard.ts`: header `Host` (anti DNS-rebinding) + allow-list de Origin + CORS + Private Network Access
3. Bearer timing-safe (`auth.ts` hasheia antes do `timingSafeEqual` — não vaza comprimento)
4. `MAX_BODY_BYTES` + Zod no `ReceiptDto` + `sanitize.ts` (tira bytes de controle → bloqueia ESC/POS injetado em campo de texto)
5. rate limit 30/min
6. `logger.ts` com `scrub-pii` — PII só entra como **campo** do merge object, nunca na string de `msg` (o formatter só scrubeia campos)

**Separação proposital pra testar fora do Windows:** tudo que depende do binário nativo mora em
`printer.ts` (require lazy). As decisões puras ficam em módulos separados e testados no CI/macOS:
`printer-select.ts` (qual fila usar), `receipt-layout.ts` (layout 48 colunas), `sanitize.ts`,
`tray.ts` (`buildTrayMenu`). Ao adicionar lógica em `printer.ts`, extraia a decisão pura.

**Injeção de dependência:** `buildServer({config, printer, configError})` — os testes montam o
server com `FakePrinterDriver` (`printer-driver.ts`). Não importe o driver real em código testável.

## Armadilhas já pagas (não reverter)

- **Rotas dentro de `app.after()`** em `server.ts`: registradas no mesmo tick do `register(rateLimit)`
  elas escapam do hook global do plugin.
- **`printerName: "auto"`** é sentinela, não nome de fila. `pickPrinterName` devolve `null` quando
  há várias impressoras e nenhuma padrão — falhar explícito é melhor que imprimir na fila errada.
- **Ciclo de import `config` ↔ `logger`**: `config.ts` importa o logger dinamicamente dentro da
  função. Não suba pro topo.
- **Sem `transport`/worker do pino** — incompatível com o `.exe` do pkg; usa `rotating-file-stream`.
- **Nativos externos ao bundle** (`tsup.external`) e empacotados como assets do pkg — mexer em
  `pkg.config.json` sem conferir os `.node` quebra a impressão só em produção.
- **`install/*.bat` é código com teste** (`tests/install-scripts.test.ts`). No totem o Windows roda
  em **Assigned Access**: sem Explorer, a pasta Startup nunca é processada → inicialização é
  tarefa agendada `ONSTART` + `SYSTEM` + `run.bat` (supervisor que reergue). Config em
  `C:\ProgramData\axis-print` via `AXIS_PRINT_CONFIG_DIR` de máquina, e a ACL devolve o SID
  `S-1-5-18` que o `lockdownConfigFile()` remove — senão o agente perde o próprio token.
- **`AXIS_PRINT_CONFIG_DIR`** sobrescreve o diretório de config (usado pelos testes e pelo instalador).
- Config inválido → backup `.bak.<ts>` + regeneração (**perde o pareamento**) e `configError: true` no `/health`.
