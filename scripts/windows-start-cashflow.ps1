# 立刻拉起金流網站（cashflow）並寫入 PM2 + Funnel :8443
#   powershell -ExecutionPolicy Bypass -File scripts\windows-start-cashflow.ps1
# 可選：
#   $env:CASHFLOW_ROOT = "C:\cash-flow-app"

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
    Write-Host "找不到金流專案目錄。" -ForegroundColor Red
    Write-Host "請確認存在 C:\cash-flow-app，或先設定："
    Write-Host '  $env:CASHFLOW_ROOT = "C:\你的金流目錄"'
    exit 1
}

Write-Host "Root: $root"
$ok = Start-CashflowPm2Fresh -WriteLog { param($m) Write-Host $m }
if (-not $ok) {
    Write-Host "WARN: start reported not healthy - check logs / port" -ForegroundColor Yellow
}

pm2 status
Write-Host ""
Write-Host -NoNewline "Local :8443 -> "
curl.exe -s -o NUL -w "%{http_code}`n" --connect-timeout 3 --max-time 8 http://127.0.0.1:8443/

if (-not $SkipFunnel) {
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
        if (Test-PortListening 8443) {
            Write-Host "Ensuring Funnel :8443 ..."
            # 不 reset 整段；只補 8443（若 setup 腳本會 reset，改呼叫完整 setup）
            & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\windows-tailscale-funnel-setup.ps1")
        } else {
            Write-Host "Port 8443 not listening - skip Funnel for now" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Done. Keep-alive: watchdog will restart cashflow if it dies." -ForegroundColor Green
Write-Host "  pm2 status"
Write-Host "  http://127.0.0.1:8443/"
Write-Host "  tailscale funnel status"
