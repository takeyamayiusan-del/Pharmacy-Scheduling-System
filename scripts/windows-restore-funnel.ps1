# 外網（Tailscale Funnel）斷了就跑這支：先重宣告，仍不通再完整 setup
#   powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot

Write-Host "=== Restore Funnel (external URL) ===" -ForegroundColor Cyan
Write-Host ("Local pharmacy :3000 = " + $(if (Test-HttpOk -Uri "http://127.0.0.1:3000/login" -TimeoutSec 8) { "OK" } else { "DOWN — start the site first" }))
Write-Host ("Tailscale state = " + (Get-TailscaleBackendState))

$ok = Repair-FunnelIfNeeded -WriteLog { param($m) Write-Host $m }
if (-not $ok) {
    Write-Host "Re-apply was not enough; running full funnel setup (reset + both ports) ..." -ForegroundColor Yellow
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1")
    $ok = Test-FunnelPublicOk
}

$url = (Get-FunnelPublicBaseUrl) + "/login"
Write-Host ""
if ($ok) {
    Write-Host "External OK: $url" -ForegroundColor Green
    Write-Host "Test on phone 4G (not store Wi-Fi)."
    exit 0
}

Write-Host "External still DOWN: $url" -ForegroundColor Red
Write-Host "1) Tailscale tray icon → Connect / Logged in"
Write-Host "2) Then re-run this script"
Write-Host "3) Phone must use 4G, not the store Wi-Fi"
exit 1
