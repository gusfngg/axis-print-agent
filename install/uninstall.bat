@echo off
setlocal
echo === Axis Print Agent — desinstalacao ===
taskkill /IM axis-print-agent.exe /F >nul 2>&1
schtasks /Delete /TN "AxisPrintAgent" /F >nul 2>&1
REM atalho legado: instalacoes antigas usavam a pasta Startup
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AxisPrintAgent.lnk" 2>nul
netsh advfirewall firewall delete rule name="AxisPrintAgent-block-9101" >nul 2>&1
rmdir /S /Q "%LOCALAPPDATA%\Axis\PrintAgent" 2>nul
echo Removido o binario, a tarefa agendada, o atalho legado e a regra de firewall.
echo (Config e logs em %APPDATA%\axis-print foram mantidos; apague manualmente se quiser.)
pause
endlocal
