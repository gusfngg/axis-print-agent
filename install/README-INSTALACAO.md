# Instalação — Axis Print Agent (notinha de caixa)

## Pré-requisitos
- Windows 10/11 x64.
- Impressora térmica 80mm com driver instalado. **Recomendado:** configurar a fila como
  "Generic / Text Only" (RAW) no Painel de Controle para o ESC/POS passar direto.

## Passos
1. Baixe `axis-print-agent.zip` da página de releases do GitHub.
2. **Confira o SHA-256** do `.exe` contra o publicado na release:
   ```powershell
   Get-FileHash axis-print-agent.exe -Algorithm SHA256
   ```
3. Extraia o zip e rode `install.bat` (botão direito -> "Executar como administrador"
   se quiser a regra de firewall).
4. O navegador abre `http://127.0.0.1:9101/health` -> deve mostrar `"ok": true`.
5. No tray (canto inferior direito), clique **"Copiar token de pareamento"**.
6. No Axis, **Admin -> Agente de Impressao**, cole o token e salve.
7. Configure a impressora (nome vem de `GET /printers`). Faça uma venda de teste -> a notinha sai.

## Se o Defender bloquear o .exe
Sem code-signing no MVP. Exclua `%LOCALAPPDATA%\Axis\PrintAgent` em
Seguranca do Windows -> Protecao contra virus -> Exclusoes.

## Se acentos saírem errados no papel
Edite `%APPDATA%\axis-print\config.json`, campo `characterSet`: teste `WPC1252`,
`PC860_PORTUGUESE`, `PC858_EURO`. Reinicie o agente.

## Diagnóstico
- `http://127.0.0.1:9101/health` mostra `printer.online` e `build`.
- Logs: `%APPDATA%\axis-print\logs\agent.log` (sem dados pessoais; 14 dias).
