# Start cashflow via PM2 + ensure Funnel :8443
# Usage (from Pharmacy-Scheduling-System):
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-cashflow.ps1
# Optional:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-cashflow.ps1 -CashflowRoot "C:\cash-flow-app"

param(
    [string]$CashflowRoot = "",
    [switch]$SkipFunnel
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")

if ($CashflowRoot) {
    $env:CASHFLOW_ROOT = $CashflowRoot
}

Write-Host "=== Start cashflow (PM2) ===" -ForegroundColor Cyan

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    throw "pm2 not found. Install: npm i -g pm2"
}

$root = Get-CashflowAppRoot
if (-not $root) {
    Write-Host "Cashflow project folder not found." -ForegroundColor Red
    Write-Host "Expected: C:\cash-flow-app"
    Write-Host "Or set:  `$env:CASHFLOW_ROOT = 'C:\path\to\cash-flow-app'"
    exit 1
}

Write-Host "Root: $root"

# Show why previous runs failed
Write-Host "Recent pm2 logs (cashflow):"
& cmd.exe /c "pm2 logs cashflow --lines 30 --nostream" 2>$null

$ok = Start-CashflowPm2Fresh -WriteLog { param($m) Write-Host $m }
if (-not $ok) {
    Write-Host "WARN: cashflow not healthy yet. Check: pm2 logs cashflow --lines 50" -ForegroundColor Yellow
}

Write-Host ""
& cmd.exe /c "pm2 status"
Write-Host ""
Write-Host -NoNewline "Local :8443 -> "
& curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 "http://127.0.0.1:8443/"

if (-not $SkipFunnel) {
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        if (Test-PortListening 8443) {
            Write-Host "Ensuring Funnel :3000 + :8443 ..."
            & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\windows-tailscale-funnel-setup.ps1")
        } else {
            Write-Host "Port 8443 not listening - skip Funnel for now" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  pm2 status"
Write-Host "  http://127.0.0.1:8443/"
Write-Host "  pm2 logs cashflow --lines 50"
Write-Host "  tailscale funnel status"
