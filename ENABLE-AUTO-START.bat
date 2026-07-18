@echo off
cd /d "%~dp0"
echo ========================================
echo   Yaosheng Pharmacy - Enable Auto Start
echo ========================================
echo.
echo This will register:
echo   - Boot/logon auto start (Docker, Supabase, web, Funnel)
echo   - Watchdog every 1 minute (restart web if down)
echo.
echo Please click YES on the UAC prompt.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-register-docker-autostart.ps1"
set ERR=%ERRORLEVEL%

echo.
if %ERR% NEQ 0 (
  echo FAILED. Error code: %ERR%
) else (
  echo DONE. Please also check manually:
  echo   1. Docker Desktop - Start when you log in
  echo   2. Win+R netplwiz - enable Windows auto logon
  echo   3. Employee URL: https://chiaho-pharmacy.tail7f62d0.ts.net/login
)
echo.
pause
