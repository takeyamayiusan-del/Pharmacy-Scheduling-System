# Restore Tailscale Funnel (external URL). Re-applying may drop live sessions.
#   powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Invoke-DirectFunnelRestore {
    $ts = $null
    $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($cmd) { $ts = $cmd.Source }
    if (-not $ts) {
        foreach ($p in @(
            "C:\Program Files\Tailscale\tailscale.exe",
            "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe"
        )) {
            if ($p -and (Test-Path -LiteralPath $p)) { $ts = $p; break }
        }
    }
    if (-not $ts) {
        Write-Host "tailscale.exe not found. Connect Tailscale tray first." -ForegroundColor Red
        return $false
    }
    Write-Host "Direct funnel re-apply: 443->3000, 8443->5000" -ForegroundColor Yellow
    & $ts funnel --bg --yes --https=443 3000
    Start-Sleep -Seconds 1
    & $ts funnel --bg --yes --https=8443 "http://127.0.0.1:5000"
    Start-Sleep -Seconds 2
    & $ts funnel status
    return $true
}

$common = Join-Path $PSScriptRoot "windows-site-common.ps1"
. $common

if (-not (Get-Command Repair-FunnelIfNeeded -ErrorAction SilentlyContinue)) {
    Write-Host "site-common failed to load; using direct tailscale commands" -ForegroundColor Yellow
    [void](Invoke-DirectFunnelRestore)
    Write-Host "Test on phone 4G (not store Wi-Fi): https://chiaho-pharmacy.tail7f62d0.ts.net/login"
    exit 0
}

Import-Pm2Environment -ProjectRoot $ProjectRoot

Write-Host "=== Restore Funnel (external URL) ===" -ForegroundColor Cyan
Write-Host ("Local pharmacy :3000 = " + $(if (Test-HttpOk -Uri "http://127.0.0.1:3000/login" -TimeoutSec 8) { "OK" } else { "DOWN - start the site first" }))
Write-Host ("Tailscale state = " + (Get-TailscaleBackendState))

$ok = Repair-FunnelIfNeeded -ForceReapply -WriteLog { param($m) Write-Host $m }
if (-not $ok) {
    Write-Host "Re-apply was not enough; trying direct funnel commands (no reset) ..." -ForegroundColor Yellow
    [void](Invoke-DirectFunnelRestore)
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
Write-Host "1) Tailscale tray icon -> Connect / Logged in"
Write-Host "2) Then re-run this script"
Write-Host "3) Phone must use 4G, not the store Wi-Fi"
exit 1
