# axis-print-agent

Agente local de impressão da **notinha de caixa** (não-fiscal, 80mm ESC/POS) do Axis ERP.
Roda na máquina do caixa, escuta em `http://127.0.0.1:9101`, recebe o `ReceiptDto`
do web app e imprime pelo spooler do Windows. Se estiver offline, o Axis cai
automaticamente no `window.print()` do navegador.

## Contrato com o Axis (NÃO QUEBRAR)
- `POST /print`  Bearer · body `{ receipt: ReceiptDto }` (notinha/DANFE) **ou** `{ ticket: TicketDto }` (cupom de senha, v1.3) → `200 {ok,durationMs}` / `503 {ok:false,error}` — o job é assinado sobre o objeto enviado (`ticket ?? receipt`)
- `GET  /health` (sem Bearer) → `{ ok, version, build, printer:{name,online}, uptimeSec, configError? }`
- `GET  /printers` Bearer → `{ printers: string[] }`
- `GET  /device-credential` (sem Bearer, **Origin obrigatório e na allow-list**) → `200 {job}` (JWS HS256 de 60s assinado com o `resumeSecret` — proof-of-possession; o segredo cru nunca sai do disco) / `404 {ok:false,error:"NOT_CONFIGURED"}` / `403 {ok:false,error:"FORBIDDEN_ORIGIN"}`
- `ReceiptDto` = cópia byte-a-byte de `src/lib/receipt-dto.ts` do repo Axis. Contrato v1.

## Dev
```bash
npm install
npm run dev -- --fake --no-tray   # sem impressora, sem tray
npm test
```

## Build do .exe (Windows)
```bash
npm run build:exe   # gera dist/axis-print-agent.exe (~40MB)
```

## Config
`%APPDATA%/axis-print/config.json` (macOS: `~/Library/Application Support/axis-print/`).
O `token` é gerado no 1º run. Cole-o na tela **Admin → Agente de Impressão** do Axis.

Campos (JSON não aceita comentário — a referência é aqui):

| Campo | Obrigatório | O quê |
|---|---|---|
| `token` | sim (auto) | Bearer das rotas `/print` e `/printers`; 64 hex, gerado no 1º run. |
| `printerName` | sim | Nome no spooler, ou `"auto"` (impressora padrão do SO). |
| `printerType` / `characterSet` | não | `EPSON` / `PC860_PORTUGUESE` por default. |
| `resumeSecret` | **não** | 64 hex do **resume secret** do totem, gerado em **/configuracoes/totens** no Axis. É a **chave HMAC** do `GET /device-credential`: a rota assina com ela um JWS de 60s (nunca devolve o segredo cru) que o kiosk troca por uma device session depois de um reboot (auto-cura da sessão). Sem ele a rota responde `404 NOT_CONFIGURED` e o totem exige ativação manual. Este é um **segredo** — o arquivo é 0600/ACL restrita, o agente nunca o loga e ele não sai do disco. |
| `allowedOrigins` | não | Allow-list de `Origin` (Camada 2). Mexer aqui só afeta config nova — em máquina já instalada, editar o arquivo e reiniciar. |

## Configuração em runtime
- `POST /config` (Bearer) `{ "printerName": "<nome da lista de /printers>" }` → seta a impressora e persiste.
- `GET /health` inclui `build` (gitSHA/timestamp do release; "dev" local) e `configError` quando o config foi auto-regenerado.

## Resiliência
- `config.json` corrompido → backup `.bak.<ts>` + regeneração (re-pareamento necessário; logado).
- Segundo launch com agente saudável já na 9101 → sai com exit 0 (sem crash).
- Logs via `rotating-file-stream` (sem worker thread → compatível com o `.exe` empacotado), teto 20MB × 14 arquivos.
- Impressões serializadas (mutex) — sem vias concorrentes.

## Segurança
Bind só em 127.0.0.1; CORS + Private Network Access; Bearer timing-safe;
ReceiptDto via Zod; sanitização ESC/POS; rate limit 30/min; logs só de metadados
(scrub PII), retenção 14 dias. Sem code-signing no MVP (hash SHA-256 no release — Sprint C).
