@echo off
REM ---------------------------------------------------------------------
REM  Supervisor do axis-print-agent.
REM
REM  A tarefa agendada e ONSTART: dispara UMA vez, no boot. Sem este loop,
REM  qualquer saida do processo (crash, exit(1) de listen falho, kill pelo
REM  Task Manager) deixa o totem sem impressao ate o proximo reboot -- e
REM  ninguem descobre, porque o agente e loopback-only e nao ha monitor
REM  externo que o alcance.
REM
REM  Tambem existe porque o .exe direto no /TR da tarefa NAO executa:
REM  confirmado em campo, pelo .bat sobe, pelo .exe nao.
REM
REM  Saida 0 e intencional (quit pelo tray, ou "agent already running" do
REM  single-instance) -> nao reinicia. Qualquer outro codigo e queda.
REM ---------------------------------------------------------------------
setlocal
set DIR=%~dp0
set LOGDIR=C:\ProgramData\axis-print
set LOG=%LOGDIR%\boot.log
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

:loop
echo [%DATE% %TIME%] iniciando axis-print-agent >> "%LOG%"
"%DIR%axis-print-agent.exe" >> "%LOG%" 2>&1
set CODE=%ERRORLEVEL%
if "%CODE%"=="0" (
  echo [%DATE% %TIME%] saida limpa ^(codigo 0^) - nao reinicia >> "%LOG%"
  goto fim
)
echo [%DATE% %TIME%] agente caiu ^(codigo %CODE%^) - reiniciando em 5s >> "%LOG%"
REM ponytail: boot.log cresce sem rotacao. Trocar por rotacao diaria se um
REM crashloop encher o disco -- ate la, um arquivo texto e o que basta.
timeout /t 5 /nobreak >nul
goto loop

:fim
endlocal
