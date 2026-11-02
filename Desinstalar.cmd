@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Desinstalar.ps1" %*
if errorlevel 1 echo A desinstalacao nao foi concluida. Leia a mensagem acima.
pause
