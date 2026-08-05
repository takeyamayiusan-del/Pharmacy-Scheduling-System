# 一次性設定：PM2 開機自啟 + 排程監控 + 註冊 pharmacy-web
# 管理員 PowerShell 執行一次即可，之後網站掛掉會自動修復：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-one-time-ops-setup.ps1

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

Write-Host "=== One-time ops setup ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ""

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    throw "pm2 not found. Install: npm install -g pm2"
}

if (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
    Write-Host "Building site first ..." -ForegroundColor Yellow
    Invoke-NpmBuild -ProjectRoot $ProjectRoot
}

Write-Host "[1/4] Register pharmacy-web in PM2 ..." -ForegroundColor Cyan
if (-not (Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $Log)) {
    throw "Failed to start pharmacy-web"
}

Write-Host "[2/4] PM2 startup (survive reboot) ..." -ForegroundColor Cyan
$startupCmd = & pm2 startup 2>&1 | Out-String
if ($startupCmd -match "sudo|pm2\.ps1") {
    $startupLine = ($startupCmd -split "`n" | Where-Object { $_ -match "pm2" } | Select-Object -Last 1).Trim()
    if ($startupLine) {
        Write-Host "Run this if PM2 does not auto-start after reboot:" -ForegroundColor Yellow
        Write-Host "  $startupLine"
    }
}
& pm2 save

Write-Host "[3/4] Register Windows scheduled tasks (boot + watchdog) ..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-register-startup-task.ps1")

Write-Host "[4/4] Health check ..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
if (-not (Test-SiteHealthy)) { throw "Site health check failed on :3000" }
if (-not (Test-PharmacyWebPm2OwningPort)) { throw "Port 3000 is not owned by PM2 pharmacy-web" }

Write-Host ""
Write-Host "Done. Site will auto-repair every minute if it goes down." -ForegroundColor Green
Write-Host "Daily update command:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-update-site.ps1"
