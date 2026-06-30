@echo off
echo ========================================
echo   Yaosheng Pharmacy - Post-reboot start
echo   Run as Administrator
echo ========================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-start-all.ps1"
echo.
pause
