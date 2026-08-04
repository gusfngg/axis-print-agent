@echo off
setlocal
echo === Axis Print Agent — desinstalacao ===
REM  ORDEM IMPORTA: a tarefa aponta pro run.bat, que e um supervisor em loop.
REM  Matar so o .exe faz o supervisor reergue-lo 5s depois. Derrubar a tarefa
REM  (e o cmd que hospeda o run.bat) ANTES de matar o binario.
schtasks /End /TN "AxisPrintAgent" >nul 2>&1
schtasks /Delete /TN "AxisPrintAgent" /F >nul 2>&1
taskkill /IM cmd.exe /FI "WINDOWTITLE eq *run.bat*" /F >nul 2>&1
taskkill /IM axis-print-agent.exe /F >nul 2>&1
REM atalho legado: instalacoes antigas usavam a pasta Startup
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AxisPrintAgent.lnk" 2>nul
netsh advfirewall firewall delete rule name="AxisPrintAgent-block-9101" >nul 2>&1
rmdir /S /Q "C:\ProgramData\Axis\PrintAgent" 2>nul
REM  path legado: instalacoes anteriores ficavam no perfil do usuario
rmdir /S /Q "%LOCALAPPDATA%\Axis\PrintAgent" 2>nul
echo Removido o binario, a tarefa agendada, o atalho legado e a regra de firewall.
echo (Config e logs em %APPDATA%\axis-print foram mantidos; apague manualmente se quiser.)
pause
endlocal
