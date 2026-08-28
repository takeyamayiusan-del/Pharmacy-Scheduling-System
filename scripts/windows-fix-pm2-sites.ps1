# 網站 HTTP 正常但 PM2 顯示 not online / 未持有 :3000 時，收編到 PM2 管理。
# 常見原因：手動 node 啟動、PM2_HOME 不一致、重開機後殘留程序。
#   powershell -ExecutionPolicy Bypass -File scripts\windows-fix-pm2-sites.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot

Write-Host "=== Fix PM2 site ownership ===" -ForegroundColor Cyan
Write-Host ("PM2_HOME = {0}" -f $(if ($env:PM2_HOME) { $env:PM2_HOME } else { "(default)" }))
Write-Host ("pm2       = {0}" -f $(if (Get-Pm2Command) { Get-Pm2Command } else { "NOT FOUND" }))
Write-Host ""

if (-not (Get-Pm2Command)) {
    Write-Host "pm2 not found in PATH. Run register-keepalive first:" -ForegroundColor Red
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
    exit 1
}

$pharmacyHttp = Test-SiteHealthy
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
Write-Host "Some checks still failing. Try:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
Write-Host "  pm2 list"
exit 1
