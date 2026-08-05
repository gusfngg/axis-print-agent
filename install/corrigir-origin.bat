@echo off
REM ---------------------------------------------------------------------
REM  Adiciona uma Origin a allow-list do config JA EXISTENTE, sem perder o
REM  token de pareamento.
REM
REM  Por que existe: mudar o default em src/config.ts so vale pra config
REM  NOVA. Em maquina instalada o allowedOrigins ja esta gravado no
REM  config.json e o default do Zod nao se aplica -- o agente continua
REM  respondendo 403 pra Origin do Axis, e o caixa continua vendo o dialogo
REM  de impressao do navegador.
REM
REM  Por que nao editar o JSON na mao: erro de sintaxe dispara o self-heal
REM  do agente, que faz backup e REGENERA o config -- com token novo. O
REM  pareamento com o Axis se perde e a loja para. Aqui o JSON e validado
REM  antes de gravar, e a gravacao e UTF-8 SEM BOM (o JSON.parse do Node
REM  nao tolera BOM -- gravar com BOM tem o mesmo efeito de corromper).
REM
REM  Uso:  corrigir-origin.bat [origin]
REM        default: https://superauto-totem.vercel.app
REM ---------------------------------------------------------------------
setlocal
cd /d "%~dp0"
set CFG=C:\ProgramData\axis-print\config.json
set AXIS_ORIGIN=%~1
if "%AXIS_ORIGIN%"=="" set AXIS_ORIGIN=https://superauto-totem.vercel.app

net session >nul 2>&1
if errorlevel 1 (
  echo ERRO: rode como ADMINISTRADOR -- o config fica em ProgramData com ACL restrita.
  pause & exit /b 1
)

if not exist "%CFG%" (
  echo ERRO: %CFG% nao existe.
  echo       Se o config estiver em outro lugar, confira a variavel de maquina
  echo       AXIS_PRINT_CONFIG_DIR: %AXIS_PRINT_CONFIG_DIR%
  pause & exit /b 1
)

echo Adicionando "%AXIS_ORIGIN%" a allow-list de %CFG% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$p=$env:CFG; $o=$env:AXIS_ORIGIN;" ^
  "$bkp=$p + '.pre-origin.' + (Get-Date -Format 'yyyyMMdd-HHmmss');" ^
  "Copy-Item -LiteralPath $p -Destination $bkp -Force;" ^
  "$j=(Get-Content -LiteralPath $p -Raw) | ConvertFrom-Json;" ^
  "$list=@(); if (($j.PSObject.Properties.Name -contains 'allowedOrigins') -and $j.allowedOrigins) { $list=@($j.allowedOrigins) };" ^
  "if ($list -contains $o) { Write-Host 'Ja estava na lista -- nada a mudar.'; exit 0 };" ^
  "$list+=$o;" ^
  "$j | Add-Member -NotePropertyName allowedOrigins -NotePropertyValue ([string[]]$list) -Force;" ^
  "$out=$j | ConvertTo-Json -Depth 10;" ^
  "$null=$out | ConvertFrom-Json;" ^
  "[System.IO.File]::WriteAllText($p,$out,(New-Object System.Text.UTF8Encoding($false)));" ^
  "Write-Host ('OK. Backup em ' + $bkp)"
if errorlevel 1 (
  echo ERRO ao gravar. O backup .pre-origin.* preserva o original.
  pause & exit /b 1
)

echo.
echo Reiniciando o agente para recarregar a config...
taskkill /IM axis-print-agent.exe /F >nul 2>&1
REM o run.bat e supervisor: espera 5s e reergue sozinho. Damos 12s de folga.
timeout /t 12 /nobreak >nul

curl -s -m 5 -o nul -w "health HTTP %%{http_code}\n" http://127.0.0.1:9101/health
if errorlevel 1 (
  echo Agente nao respondeu -- o supervisor pode nao estar rodando. Forcando a tarefa...
  schtasks /Run /TN "AxisPrintAgent" >nul 2>&1
  timeout /t 8 /nobreak >nul
  curl -s -m 5 -o nul -w "health HTTP %%{http_code}\n" http://127.0.0.1:9101/health
)

echo.
echo Teste do preflight com a Origin corrigida ^(esperado: HTTP 204^):
curl -s -o nul -w "preflight HTTP %%{http_code}\n" -m 5 -X OPTIONS http://127.0.0.1:9101/print -H "Origin: %AXIS_ORIGIN%" -H "Access-Control-Request-Method: POST"
echo.
echo Se deu 204, faca uma venda de teste: a notinha deve sair sem o dialogo do navegador.
pause
endlocal
