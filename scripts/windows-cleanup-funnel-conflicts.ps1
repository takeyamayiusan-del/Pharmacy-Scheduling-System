# One-shot cleanup + ensure Funnel. ASCII-only.
#   powershell -ExecutionPolicy Bypass -File scripts\windows-cleanup-funnel-conflicts.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$env:Path = @(
  $env:Path,
  "C:\Program Files\Tailscale",
  "C:\Program Files\nodejs",
  "$env:APPDATA\npm"
) -join ";"

Write-Host "=== Cleanup duplicate Yaosheng / Funnel tasks ===" -ForegroundColor Cyan

$oldTasks = @(
  "YaoshengPharmacyWatchdog",
  "YaoshengPharmacyBoot",
  "YaoshengFunnelWatchdog",
  "YaoshengFunnelSetup"
)

foreach ($name in $oldTasks) {
  $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($t) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "  Removed old task: $name" -ForegroundColor Yellow
  } else {
    Write-Host "  (no task) $name"
  }
}

Get-ScheduledTask | Where-Object { $_.TaskName -like "Yaosheng*" } |
  Select-Object TaskName, State | Format-Table -AutoSize

Write-Host ""
Write-Host "=== Ensure Funnel once (idempotent, ForceReset) ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1") -ForceReset

Write-Host ""
Write-Host "=== Run watchdog once ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-docker-watchdog.ps1")
Get-Content (Join-Path $ProjectRoot "data\logs\docker-watchdog.log") -Tail 25

Write-Host ""
Write-Host "Done. Keep only YaoshengDockerBoot + YaoshengDockerWatchdog." -ForegroundColor Green
Write-Host "Do NOT spam funnel reset. Watchdog re-ensures mounts every minute." -ForegroundColor Yellow
Write-Host "Phone 4G test: https://chiaho-pharmacy.tail7f62d0.ts.net/login"
