@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動耀聖藥局服務...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-docker-boot.ps1"
echo.
echo 完成。本機: http://localhost:3000
echo 外網: https://chiaho-pharmacy.tail7f62d0.ts.net/login
pause
