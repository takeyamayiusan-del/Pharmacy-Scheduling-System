@echo off
chcp 65001 >nul
echo ========================================
echo   耀聖藥局 - 重開機後一鍵啟動
echo   請以系統管理員身分執行
echo ========================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-start-all.ps1"
echo.
pause
