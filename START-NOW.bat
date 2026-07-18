@echo off
cd /d "%~dp0"
echo Starting Yaosheng Pharmacy services...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-docker-boot.ps1"
echo.
echo Local:  http://localhost:3000
echo Public: https://chiaho-pharmacy.tail7f62d0.ts.net/login
echo.
pause
