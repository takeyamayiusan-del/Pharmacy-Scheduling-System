# One-shot cleanup: remove duplicate Yaosheng tasks + set Funnel once (no thrashing)
# Run as Administrator:
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

# Keep only these two
Get-ScheduledTask | Where-Object { $_.TaskName -like "Yaosheng*" } |
  Select-Object TaskName, State | Format-Table -AutoSize

Write-Host ""
Write-Host "=== Reset Funnel ONCE, then set pharmacy+cashflow ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "windows-tailscale-funnel-setup.ps1") -ForceReset

Write-Host ""
Write-Host "Done. Keep only YaoshengDockerBoot + YaoshengDockerWatchdog." -ForegroundColor Green
Write-Host "Do NOT manually spam: funnel reset / funnel --bg / START-NOW repeatedly." -ForegroundColor Yellow
Write-Host "Test on phone 4G (Wi-Fi off): https://chiaho-pharmacy.tail7f62d0.ts.net/login"
