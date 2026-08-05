# 修復／啟動 pharmacy-web（Windows PM2 專用）
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows-start-pharmacy-web.ps1

param(
    [switch]$SkipPortCleanup
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

. (Join-Path $PSScriptRoot "windows-site-common.ps1")
$Log = { param($m) Write-Host $m }

if (-not (Test-Path (Join-Path $ProjectRoot ".env.local"))) {
    throw "Missing .env.local. Copy from .env.local.example and fill Supabase keys."
}

if (-not (Test-PharmacyWebBuildReady -ProjectRoot $ProjectRoot)) {
    Write-Host "Missing or incomplete .next — running build first ..." -ForegroundColor Yellow
    Invoke-NpmBuild -ProjectRoot $ProjectRoot
}

$ok = Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog $Log -SkipPortCleanup:$SkipPortCleanup
if (-not $ok) {
    Write-Host ""
    Write-Host "Foreground debug:" -ForegroundColor Yellow
    Write-Host "  cd $ProjectRoot"
    Write-Host "  node scripts\pm2-pharmacy-web.cjs"
    throw "pharmacy-web is not online"
}

Write-Host ""
Write-Host "pharmacy-web is online on :3000" -ForegroundColor Green
Write-Host "Open http://127.0.0.1:3000/attendance and press Ctrl+F5"
