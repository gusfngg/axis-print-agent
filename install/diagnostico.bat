@echo off
REM ---------------------------------------------------------------------
REM  Coletor de diagnostico. Roda no totem, gera um TXT unico com a
REM  evidencia que separa as causas de "a notinha nao sai e o navegador
REM  abre o dialogo de impressao":
REM
REM    processo morto           -> secoes 1/2/8 (boot.log mostra o exit code)
REM    impressora nao resolvida -> secoes 3/6/7 (printer.online:false)
REM    navegador barrado        -> secao 5 (preflight 403 = Origin recusada)
REM
REM  Uso:  diagnostico.bat  [origin-do-axis]
REM        ex: diagnostico.bat https://erp.minhaloja.com.br
REM
REM  NAO grava o token no arquivo de saida -- ele e credencial e este TXT
REM  e feito pra ser enviado por WhatsApp/email.
REM ---------------------------------------------------------------------
setlocal
cd /d "%~dp0"
set CFG=C:\ProgramData\axis-print
set OUT=%CFG%\diagnostico.txt
set ORIGIN=%~1
if "%ORIGIN%"=="" set ORIGIN=https://superauto-totem.vercel.app
if not exist "%CFG%" mkdir "%CFG%" 2>nul

echo Coletando diagnostico, aguarde...
> "%OUT%" echo === AXIS PRINT AGENT - DIAGNOSTICO ===
call :add "Data: %DATE% %TIME%"
call :add "Maquina: %COMPUTERNAME%  /  Executado por: %USERNAME%"
call :add "AXIS_PRINT_CONFIG_DIR=%AXIS_PRINT_CONFIG_DIR%"
call :add "Origin testada: %ORIGIN%"

call :sec "1. O PROCESSO ESTA VIVO?"
tasklist /FI "IMAGENAME eq axis-print-agent.exe" >> "%OUT%" 2>&1

call :sec "2. ALGUEM ESCUTANDO NA 9101?"
netstat -ano | findstr :9101 >> "%OUT%" 2>&1
if errorlevel 1 call :add "nada escutando na 9101"

call :sec "3. GET /health"
curl -s -m 5 http://127.0.0.1:9101/health >> "%OUT%" 2>&1
if errorlevel 1 call :add "curl falhou -- agente nao respondeu"

call :sec "4. TAREFA AGENDADA (subiu no boot?)"
schtasks /Query /TN "AxisPrintAgent" /V /FO LIST >> "%OUT%" 2>&1

call :sec "5. PREFLIGHT DO NAVEGADOR (403 aqui = agente recusa a Origin do Axis)"
curl -s -i -m 5 -X OPTIONS http://127.0.0.1:9101/print -H "Origin: %ORIGIN%" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Private-Network: true" >> "%OUT%" 2>&1

call :sec "6. IMPRESSORAS INSTALADAS NO SO"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Printer | Select-Object Name,PrinterStatus,PortName | Format-Table -AutoSize; 'PADRAO: ' + (Get-CimInstance Win32_Printer -Filter 'Default=True').Name" >> "%OUT%" 2>&1

call :sec "7. CONFIG (token omitido de proposito)"
findstr /v /i "token" "%CFG%\config.json" >> "%OUT%" 2>&1
if errorlevel 1 call :add "config.json nao encontrado em %CFG%"
dir /b "%CFG%\config.json.bak.*" >> "%OUT%" 2>&1
if not errorlevel 1 call :add "^^ EXISTEM BACKUPS: o config foi regenerado -- o pareamento com o Axis se perdeu"

call :sec "8. BOOT.LOG - ultimas 80 linhas (exit codes / crashloop)"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content '%CFG%\boot.log' -Tail 80 -ErrorAction SilentlyContinue" >> "%OUT%" 2>&1

call :sec "9. AGENT.LOG - ultimas 80 linhas"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content '%CFG%\logs\agent.log' -Tail 80 -ErrorAction SilentlyContinue" >> "%OUT%" 2>&1

call :sec "10. BINARIO NO LUGAR? (Defender remove sem avisar)"
dir "C:\ProgramData\Axis\PrintAgent" >> "%OUT%" 2>&1

echo.
echo Pronto: %OUT%
start "" notepad "%OUT%"
endlocal
exit /b 0

:add
>> "%OUT%" echo %~1
goto :eof

:sec
>> "%OUT%" echo.
>> "%OUT%" echo --- %~1 ---
goto :eof
