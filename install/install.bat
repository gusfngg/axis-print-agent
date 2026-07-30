@echo off
setlocal enabledelayedexpansion
set EXE=axis-print-agent.exe
set EXPECTED=__SHA256__

echo === Axis Print Agent — instalacao ===
if not exist "%EXE%" ( echo ERRO: %EXE% nao encontrado nesta pasta. & pause & exit /b 1 )

echo Verificando integridade (SHA-256)...
for /f "skip=1 tokens=* delims=" %%H in ('certutil -hashfile "%EXE%" SHA256') do (
  if not defined ACTUAL set ACTUAL=%%H
)
set ACTUAL=%ACTUAL: =%
if /I not "%ACTUAL%"=="%EXPECTED%" (
  echo ERRO: hash nao confere.
  echo   esperado: %EXPECTED%
  echo   obtido:   %ACTUAL%
  echo Nao instale este arquivo. & pause & exit /b 1
)
echo Hash OK.

set DEST=%LOCALAPPDATA%\Axis\PrintAgent
mkdir "%DEST%" 2>nul
copy /Y "%EXE%" "%DEST%\%EXE%" >nul
echo Copiado para %DEST%

echo Criando regra de firewall (bloqueia 9101 vindo de fora do loopback)...
netsh advfirewall firewall delete rule name="AxisPrintAgent-block-9101" >nul 2>&1
netsh advfirewall firewall add rule name="AxisPrintAgent-block-9101" dir=in action=block protocol=TCP localport=9101 remoteip=LocalSubnet,Internet >nul 2>&1
if errorlevel 1 ( echo AVISO: sem permissao p/ firewall. Rode como admin se quiser a regra. )

REM ---------------------------------------------------------------
REM  Inicializacao automatica: TAREFA AGENDADA, nao pasta Startup.
REM
REM  No totem o Windows roda em Assigned Access (modo quiosque, conta
REM  kioskUser0). Nessa sessao o Explorer NAO sobe — e sem Explorer a
REM  pasta Startup nunca e processada. Um atalho ali "instalaria com
REM  sucesso" e o agente jamais iniciaria: a falha so apareceria na
REM  primeira NFC-e que nao imprimisse. Tarefa agendada roda com ou
REM  sem shell.
REM ---------------------------------------------------------------
echo Registrando inicializacao automatica (tarefa agendada)...
schtasks /Create /TN "AxisPrintAgent" /TR "\"%DEST%\%EXE%\"" /SC ONLOGON /RU "%USERNAME%" /F >nul 2>&1
if errorlevel 1 (
  echo AVISO: nao foi possivel criar a tarefa agendada.
  echo        Caindo pro atalho em Startup — ATENCAO: isso NAO funciona
  echo        em modo quiosque/Assigned Access. Verifique manualmente.
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\AxisPrintAgent.lnk'); $s.TargetPath='%DEST%\%EXE%'; $s.WorkingDirectory='%DEST%'; $s.Save()"
) else (
  echo Tarefa "AxisPrintAgent" criada para o usuario %USERNAME%.
  echo IMPORTANTE: rode este instalador NA CONTA que o totem usa ^(ex: kioskUser0^),
  echo             senao a tarefa nasce na conta errada e nao dispara.
)

echo Iniciando o agente...
start "" "%DEST%\%EXE%"
timeout /t 4 >nul
start "" "http://127.0.0.1:9101/health"

echo.
echo Pronto. Abra o tray, clique "Copiar token de pareamento" e cole no Axis
echo (Admin -^> Agente de Impressao). Depois escolha a impressora.
pause
endlocal
