@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   耀聖藥局 — 一鍵啟用自動啟動／守護
echo ========================================
echo.
echo 將會設定：
echo   - 登入／開機自動啟動 Docker Supabase 網站 Funnel
echo   - 每分鐘檢查，網站關掉會自動再開
echo.
echo 請在跳出的 UAC 視窗按「是」
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-register-docker-autostart.ps1"

echo.
echo 若上面成功，請再確認：
echo   1. Docker Desktop 勾選 Start when you log in
echo   2. Win+R 輸入 netplwiz → 取消「必須輸入密碼」→ 設自動登入
echo   3. 員工網址: https://chiaho-pharmacy.tail7f62d0.ts.net/login
echo.
pause
