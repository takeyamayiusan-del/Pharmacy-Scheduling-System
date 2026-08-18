# 一次性雙站就緒：PM2 + cashflow 註冊 + Funnel 雙入口 + 開機/監控排程
# 管理員 PowerShell 執行一次，離機前再跑 health-check：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-one-time-ops-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-one-time-ops-setup.ps1 -CashflowScript "C:\cash-flow-app\backend\index.js" -CashflowCwd "C:\cash-flow-app"

param(
    [string]$CashflowScript = "C:\cash-flow-app\backend\index.js",
    [string]$CashflowCwd = "C:\cash-flow-app",
    [int]$CashflowPort = 5000,
    [switch]$SkipCashflow,
    [switch]$SkipFunnel
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. (Join-Path $PSScriptRoot "windows-site-common.ps1")
$Log = { param($m) Write-Host $m }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

Write-Host "=== One-time dual-site ops setup ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ""

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    throw "pm2 not found. Install: npm install -g pm2"
}

$StartTaskName = "YaoshengPharmacyStart"
$WatchdogTaskName = "YaoshengPharmacyWatchdog"

# 避免 setup 過程被每分鐘 watchdog 插入
Stop-ScheduledTask -TaskName $StartTaskName -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
Disable-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue

if (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
    Write-Host "Building site first ..." -ForegroundColor Yellow
    Invoke-NpmBuild -ProjectRoot $ProjectRoot
}

Write-Host "[1/6] Register pharmacy-web in PM2 ..." -ForegroundColor Cyan
if (-not (Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $Log)) {
    throw "Failed to start pharmacy-web"
}

Write-Host "[2/6] Register cashflow in PM2 + bootstrap ..." -ForegroundColor Cyan
if ($SkipCashflow) {
    Write-Host "  Skipped (-SkipCashflow)" -ForegroundColor Yellow
} elseif (-not (Test-Path -LiteralPath $CashflowScript)) {
    Write-Host "  Cashflow script not found: $CashflowScript" -ForegroundColor Yellow
    Write-Host "  Skip now; register later with windows-register-cashflow.ps1" -ForegroundColor Yellow
} else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-register-cashflow.ps1") `
        -ScriptPath $CashflowScript `
        -Cwd $CashflowCwd `
        -Port $CashflowPort
    if ($LASTEXITCODE -ne 0) { throw "cashflow register failed" }
}

Write-Host "[3/6] PM2 save (Windows uses Task Scheduler, not pm2 startup) ..." -ForegroundColor Cyan
& pm2 save 2>$null | Out-Null

Write-Host "[4/6] Tailscale Funnel dual routes (443→3000, 8443→$CashflowPort) ..." -ForegroundColor Cyan
if ($SkipFunnel) {
    Write-Host "  Skipped (-SkipFunnel)" -ForegroundColor Yellow
} else {
    $funnelArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1"))
    if ($SkipCashflow -or -not (Test-Path -LiteralPath $CashflowScript)) {
        $funnelArgs += "-PharmacyOnly"
    }
    & powershell @funnelArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Funnel setup returned error — check tailscale funnel status --json" -ForegroundColor Yellow
    }
}

Write-Host "[5/6] Register Windows scheduled tasks (boot + simple keepalive) ..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-register-startup-task.ps1")
Enable-ScheduledTask -TaskName $StartTaskName -ErrorAction SilentlyContinue | Out-Null
Enable-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue | Out-Null
Start-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue

Write-Host "[6/6] Health check ..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
if (-not (Test-SiteHealthy)) { throw "Site health check failed on :3000" }
if (-not (Test-PharmacyWebPm2OwningPort)) { throw "Port 3000 is not owned by PM2 pharmacy-web tree" }

$cfPort = Get-CashflowHealthPort -ProjectRoot $ProjectRoot
if (-not $SkipCashflow -and (Test-Path -LiteralPath $CashflowScript)) {
    if (-not (Test-CashflowHealthy -ProjectRoot $ProjectRoot)) {
        throw "cashflow unhealthy on :$cfPort"
    }
    if (-not ((Test-FunnelProxyConfigured -LocalPort $cfPort -PublicHttpsPort 8443) -or (Test-FunnelProxyConfigured -LocalPort $cfPort))) {
        Write-Host "WARNING: funnel 8443 missing — run windows-tailscale-funnel-setup.ps1" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done. Both sites monitored every minute; boot task restores after reboot." -ForegroundColor Green
Write-Host ""
Write-Host "Final verify before you leave:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-health-check.ps1"
Write-Host ""
Write-Host "Safe updates (independent):"
Write-Host "  pharmacy:  powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1"
Write-Host "  cashflow:  powershell -ExecutionPolicy Bypass -File scripts\windows-update-cashflow.ps1"
Write-Host ""
Write-Host "External URLs:"
Write-Host "  pharmacy: https://chiaho-pharmacy.tail7f62d0.ts.net/login"
Write-Host "  cashflow: https://chiaho-pharmacy.tail7f62d0.ts.net:8443/"
