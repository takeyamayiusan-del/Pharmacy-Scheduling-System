# Start cashflow: node backend/index.js on port 5000 (NOT pm2 start npm)
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-cashflow.ps1

param(
    [string]$CashflowRoot = "",
    [switch]$SkipFunnel
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")

if ($CashflowRoot) { $env:CASHFLOW_ROOT = $CashflowRoot }

Write-Host "=== Start cashflow (node backend/index.js :5000) ===" -ForegroundColor Cyan

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    throw "pm2 not found. Install: npm i -g pm2"
}

$root = Get-CashflowAppRoot
if (-not $root) {
    Write-Host "Cashflow folder not found. Expected C:\cash-flow-app"
    exit 1
}

Write-Host "Root: $root"
$ok = Start-CashflowPm2Fresh -WriteLog { param($m) Write-Host $m }

$port = Get-CashflowListenPort
pm2 status
Write-Host -NoNewline "Local :$port -> "
& curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 "http://127.0.0.1:$port/"

if (-not $SkipFunnel -and (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    if (Test-CashflowHealthy) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\windows-tailscale-funnel-setup.ps1")
    }
}

if (-not $ok) {
    Write-Host "Failed. Check: pm2 logs cashflow --lines 50" -ForegroundColor Yellow
    exit 1
}
Write-Host "OK. Cashflow on http://127.0.0.1:$port/" -ForegroundColor Green
