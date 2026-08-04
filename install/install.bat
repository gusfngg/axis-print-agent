@echo off
setlocal enabledelayedexpansion
REM  "Executar como administrador" inicia o cmd em C:\Windows\System32, nao na
REM  pasta do script. Sem isto, %EXE% e run.bat sao procurados no lugar errado
REM  e o instalador para com "nao encontrado nesta pasta" -- com o arquivo la.
cd /d "%~dp0"
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

net session >nul 2>&1
if errorlevel 1 (
  echo ERRO: rode este instalador como ADMINISTRADOR.
  echo       Sem admin nao da pra criar a tarefa ONSTART/SYSTEM nem ajustar ACL,
  echo       e o agente nao sobe no totem ^(Assigned Access^). & pause & exit /b 1
)

REM  ProgramData, nao %LOCALAPPDATA%: o agente roda como SYSTEM e perfil de
REM  usuario e armadilha de permissao.
set DEST=C:\ProgramData\Axis\PrintAgent
set CFGDIR=C:\ProgramData\axis-print
mkdir "%DEST%" 2>nul
mkdir "%CFGDIR%" 2>nul
copy /Y "%EXE%" "%DEST%\%EXE%" >nul
copy /Y "run.bat" "%DEST%\run.bat" >nul
echo Copiado para %DEST%

REM  Sem esta var DE MAQUINA o config nasce no %APPDATA% de quem executa, e
REM  trocar a conta de execucao faz o agente "perder" o token e gerar outro.
setx AXIS_PRINT_CONFIG_DIR "%CFGDIR%" /M >nul

REM  lockdownConfigFile() faz icacls /inheritance:r, que remove ate o SYSTEM.
REM  Rodando como SYSTEM o agente nao leria o proprio config -> regenera ->
REM  EPERM -> perde o token. SIDs em vez de nomes: funciona em Windows pt-BR.
icacls "%CFGDIR%" /grant "*S-1-5-18:(OI)(CI)F" /grant "*S-1-5-32-544:(OI)(CI)F" /T >nul 2>&1

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
REM  ONSTART + SYSTEM + run.bat. Tres decisoes, todas com motivo:
REM   - ONSTART, nao ONLOGON: dispara no boot, independente de quem loga. No
REM     totem quem loga e kioskUser0 (autologon); amarrar a tarefa a outra
REM     conta faz ela nunca disparar.
REM   - SYSTEM: nao exige senha armazenada e roda antes de qualquer login.
REM   - run.bat, nao o .exe: o .exe direto no /TR nao executa (campo), e o
REM     .bat e o supervisor que reergue o agente se ele cair.
echo Registrando inicializacao automatica (tarefa agendada)...
schtasks /Create /TN "AxisPrintAgent" /TR "\"%DEST%\run.bat\"" /SC ONSTART /RU "SYSTEM" /RL HIGHEST /F >nul 2>&1
if errorlevel 1 (
  echo ERRO: nao foi possivel criar a tarefa agendada.
  echo       NAO caia pra pasta Startup: em Assigned Access o Explorer nao
  echo       sobe, a Startup nunca e processada e o agente jamais inicia --
  echo       falha silenciosa que so aparece quando a nota nao sai.
  pause & exit /b 1
)
echo Tarefa "AxisPrintAgent" criada ^(ONSTART, SYSTEM^).

echo Iniciando o agente...
schtasks /Run /TN "AxisPrintAgent" >nul 2>&1
timeout /t 4 >nul
start "" "http://127.0.0.1:9101/health"

echo.
echo Pronto. Abra o tray, clique "Copiar token de pareamento" e cole no Axis
echo (Admin -^> Agente de Impressao). Depois escolha a impressora.
pause
endlocal
