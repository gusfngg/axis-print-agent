#!/bin/bash
# Instala uma release do axis-print-agent no totem via SSH (runbook validado 2026-08-13):
# baixa o exe do GitHub Release → confere SHA-256 → scp → para a task → backup .bak.<ts>
# → troca → sobe → /health. Se printer.online != true, REVERTE pro backup sozinho.
#
#   ./install/deploy-totem.sh v1.3.2
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"

VER="${1:?uso: deploy-totem.sh vX.Y.Z}"
TMP="$(mktemp -d)"
gh release download "$VER" -D "$TMP" -p 'axis-print-agent.exe*'
# O .sha256 do CI vem "hash\r\n" (sem nome de arquivo, CRLF) — v1.4.0 quebrou o `shasum -c`.
SHA="$(tr -d '\r\n ' < "$TMP/axis-print-agent.exe.sha256" | cut -c1-64 | tr 'A-F' 'a-f')"
LOCAL="$(shasum -a 256 "$TMP/axis-print-agent.exe" | cut -c1-64)"
[ "$SHA" = "$LOCAL" ] || { echo "SHA MISMATCH release=$SHA local=$LOCAL"; exit 1; }
echo "sha256 ok $SHA"
scp -q "$TMP/axis-print-agent.exe" totem:C:/ProgramData/Axis/PrintAgent/axis-print-agent.new.exe

PS=$(cat <<EOF
\$d="C:\\ProgramData\\Axis\\PrintAgent"
\$h=(Get-FileHash "\$d\\axis-print-agent.new.exe" -Algorithm SHA256).Hash.ToLower()
if (\$h -ne "$SHA") { Write-Output "HASH MISMATCH \$h"; exit 1 }
Stop-ScheduledTask AxisPrintAgent
Stop-Process -Name axis-print-agent -Force -ErrorAction SilentlyContinue
Start-Sleep 2
\$ts=Get-Date -Format yyyyMMddHHmmss
Copy-Item "\$d\\axis-print-agent.exe" "\$d\\axis-print-agent.bak.\$ts.exe"
Move-Item "\$d\\axis-print-agent.new.exe" "\$d\\axis-print-agent.exe" -Force
Start-ScheduledTask AxisPrintAgent
Start-Sleep 8
\$health=(Invoke-WebRequest http://127.0.0.1:9101/health -UseBasicParsing).Content
Write-Output "bak=\$ts"
Write-Output \$health
if (\$health -notmatch '"online":true') {
  Write-Output "printer offline -> REVERTENDO pro backup"
  Stop-ScheduledTask AxisPrintAgent
  Stop-Process -Name axis-print-agent -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
  Copy-Item "\$d\\axis-print-agent.bak.\$ts.exe" "\$d\\axis-print-agent.exe" -Force
  Start-ScheduledTask AxisPrintAgent
  Start-Sleep 8
  (Invoke-WebRequest http://127.0.0.1:9101/health -UseBasicParsing).Content
  exit 1
}
EOF
)
ENC=$(printf '%s' "$PS" | iconv -f UTF-8 -t UTF-16LE | base64)
ssh totem "powershell -NoProfile -EncodedCommand $ENC" | grep -v CLIXML | grep -v '^<Objs'
