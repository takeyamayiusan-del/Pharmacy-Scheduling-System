# Fix both pharmacy-web + cashflow when PM2 shows errored/stopped
# Run from Pharmacy-Scheduling-System:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-fix-pm2-sites.ps1

param(
    [string]$CashflowRoot = ""
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")

if ($CashflowRoot) { $env:CASHFLOW_ROOT = $CashflowRoot }

Write-Host "=== Fix PM2 pharmacy-web + cashflow ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

Write-Host ""
Write-Host "--- pharmacy-web recent logs ---"
& cmd.exe /c "pm2 logs pharmacy-web --lines 40 --nostream" 2>$null

Write-Host ""
Write-Host "--- cashflow recent logs ---"
& cmd.exe /c "pm2 logs cashflow --lines 40 --nostream" 2>$null

Write-Host ""
Write-Host "Restarting both cleanly..."
$ok = Restart-DualSitesClean -ProjectRoot $ProjectRoot -WriteLog { param($m) Write-Host $m }

Write-Host ""
& cmd.exe /c "pm2 status"
Write-Host ""
Write-Host -NoNewline "Auth  :54321 -> "
& curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 "http://127.0.0.1:54321/auth/v1/health"
Write-Host -NoNewline "Site  :3000  -> "
& curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 "http://127.0.0.1:3000/login"
$cashPort = Get-CashflowListenPort
Write-Host -NoNewline "Cash  :$cashPort -> "
& curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 "http://127.0.0.1:$cashPort/"

if (-not $ok) {
    Write-Host ""
    Write-Host "Still unhealthy. Paste output of:" -ForegroundColor Yellow
    Write-Host "  pm2 logs pharmacy-web --lines 80 --nostream"
    Write-Host "  pm2 logs cashflow --lines 80 --nostream"
    exit 1
}

Write-Host ""
Write-Host "OK. Both should be online." -ForegroundColor Green
exit 0
