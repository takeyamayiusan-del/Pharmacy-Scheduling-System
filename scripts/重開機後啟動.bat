@echo off
:: Re-run anytime after reboot. Auto-elevates to Administrator (UAC prompt).
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ========================================
echo   Yaosheng Pharmacy - Post-reboot start
echo   Running as Administrator
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-start-all.ps1"
set EXITCODE=%errorLevel%

echo.
if %EXITCODE% neq 0 (
    echo [FAILED] Startup script exited with code %EXITCODE%
) else (
    echo [OK] Startup finished. Open http://localhost:3000/login
)
echo.
pause
exit /b %EXITCODE%
