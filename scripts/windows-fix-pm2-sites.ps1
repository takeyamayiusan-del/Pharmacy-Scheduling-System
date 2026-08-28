# 網站 HTTP 正常但 PM2 顯示 not online / 未持有 :3000 時，收編到 PM2 管理。
# 若 .next 不完整會先 npm run build（約 1～3 分鐘）。
#   powershell -ExecutionPolicy Bypass -File scripts\windows-fix-pm2-sites.ps1
# 略過 build（僅當 .next 已確認完整）：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-fix-pm2-sites.ps1 -SkipBuild

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot

$WatchdogTaskName = "YaoshengPharmacyWatchdog"
$FunnelMonitorTaskName = "YaoshengPharmacyFunnelMonitor"

Write-Host "=== Fix PM2 site ownership ===" -ForegroundColor Cyan
Write-Host ("PM2_HOME = {0}" -f $(if ($env:PM2_HOME) { $env:PM2_HOME } else { "(default)" }))
Write-Host ("pm2       = {0}" -f $(if (Get-Pm2Command) { Get-Pm2Command } else { "NOT FOUND" }))
Write-Host ""

if (-not (Get-Pm2Command)) {
    Write-Host "pm2 not found in PATH. Run register-keepalive first:" -ForegroundColor Red
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
    exit 1
}

$pharmacyHttp = Test-PharmacyWebHttpHealthy
$cashflowHttp = Test-CashflowHealthy -ProjectRoot $ProjectRoot
$pharmacyPm2 = Test-PharmacyWebPm2OwningPort
$cashflowPm2 = Get-Pm2Online -Name "cashflow"

Write-Host ("  pharmacy HTTP     {0}" -f $(if ($pharmacyHttp) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($pharmacyHttp) { "Green" } else { "Red" })
Write-Host ("  pharmacy PM2 :3000 {0}" -f $(if ($pharmacyPm2) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($pharmacyPm2) { "Green" } else { "Red" })
Write-Host ("  cashflow HTTP     {0}" -f $(if ($cashflowHttp) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($cashflowHttp) { "Green" } else { "Red" })
Write-Host ("  cashflow PM2      {0}" -f $(if ($cashflowPm2) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($cashflowPm2) { "Green" } else { "Red" })
Write-Host ""

if ($pharmacyPm2 -and ($cashflowPm2 -or -not $cashflowHttp)) {
    Write-Host "PM2 already owns running sites. Nothing to do." -ForegroundColor Green
    exit 0
}

Write-Host "Pausing watchdog + funnel monitor during PM2 adopt ..." -ForegroundColor Yellow
Stop-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $FunnelMonitorTaskName -ErrorAction SilentlyContinue

[void](Clear-StaleBuildLock -ProjectRoot $ProjectRoot -WriteLog { param($m) Write-Host $m })

try {
    if (-not $SkipBuild -and -not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
        Write-Host "Building pharmacy site (.next incomplete) ..." -ForegroundColor Cyan
        try {
            Invoke-NpmBuild -ProjectRoot $ProjectRoot
        } catch {
            if ($_.Exception.Message -like "*Another build is already running*") {
                Write-Host "Stale build lock detected — clearing and retrying once ..." -ForegroundColor Yellow
                [void](Clear-StaleBuildLock -ProjectRoot $ProjectRoot -MaxAgeMinutes 0 -WriteLog { param($m) Write-Host $m })
                try {
                    Invoke-NpmBuild -ProjectRoot $ProjectRoot
                } catch {
                    Write-Host ("Build failed: {0}" -f $_.Exception.Message) -ForegroundColor Red
                    Write-Host "Manual: Remove-Item data\logs\.building -Force -ErrorAction SilentlyContinue"
                    Write-Host "Then:   powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -NoPull"
                    exit 1
                }
            } else {
                Write-Host ("Build failed: {0}" -f $_.Exception.Message) -ForegroundColor Red
                Write-Host "Try: powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -NoPull"
                exit 1
            }
        }
    }

    Write-Host "Adopting sites into PM2 (may restart :3000 / :5000 briefly)..." -ForegroundColor Yellow
    $ok = Repair-Pm2SitesIfNeeded -ProjectRoot $ProjectRoot -WriteLog { param($m) Write-Host $m }

    Write-Host ""
    $pharmacyPm2After = Test-PharmacyWebPm2OwningPort
    $cashflowPm2After = Get-Pm2Online -Name "cashflow"
    Write-Host ("  pharmacy PM2 :3000 {0}" -f $(if ($pharmacyPm2After) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($pharmacyPm2After) { "Green" } else { "Red" })
    Write-Host ("  cashflow PM2      {0}" -f $(if ($cashflowPm2After) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($cashflowPm2After) { "Green" } else { "Red" })

    if ($ok -and $pharmacyPm2After -and ($cashflowPm2After -or -not $cashflowHttp)) {
        Write-Host ""
        Write-Host "PM2 adoption OK. Re-run health-check to confirm." -ForegroundColor Green
        exit 0
    }

    Write-Host ""
    Write-Host "Some checks still failing. Try full site update:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1 -NoPull"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-cashflow.ps1 -ScriptPath C:\cash-flow-app\backend\index.js -Cwd C:\cash-flow-app -Port 5000"
    Write-Host "  pm2 list"
    exit 1
}
finally {
    Enable-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue | Out-Null
    Start-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue
    Enable-ScheduledTask -TaskName $FunnelMonitorTaskName -ErrorAction SilentlyContinue | Out-Null
    Start-ScheduledTask -TaskName $FunnelMonitorTaskName -ErrorAction SilentlyContinue
}
