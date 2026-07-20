# Register Docker auto-start + watchdog tasks
# Run as Administrator (or via ENABLE-AUTO-START.bat)
$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BootScript = Join-Path $ProjectRoot "scripts\windows-docker-boot.ps1"
$WatchdogScript = Join-Path $ProjectRoot "scripts\windows-docker-watchdog.ps1"
$BootTask = "YaoshengDockerBoot"
$WatchdogTask = "YaoshengDockerWatchdog"

if (-not (Test-Path $BootScript)) { throw "Missing: $BootScript" }
if (-not (Test-Path $WatchdogScript)) { throw "Missing: $WatchdogScript" }

$userId = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$bootAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$BootScript`""

$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $userId
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$triggerStartup.Delay = "PT2M"

Unregister-ScheduledTask -TaskName $BootTask -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "YaoshengPharmacyBoot" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $BootTask `
    -Action $bootAction `
    -Trigger @($triggerLogon, $triggerStartup) `
    -Principal $principal `
    -Settings $settings `
    -Description "Yaosheng pharmacy Docker boot: Supabase + web + Funnel" | Out-Null

$watchAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogScript`""

$watchTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration ([TimeSpan]::MaxValue)

$watchSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Unregister-ScheduledTask -TaskName $WatchdogTask -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "YaoshengPharmacyWatchdog" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "YaoshengFunnelWatchdog" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "YaoshengFunnelSetup" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $WatchdogTask `
    -Action $watchAction `
    -Trigger $watchTrigger `
    -Principal $principal `
    -Settings $watchSettings `
    -Description "Yaosheng multi-site watchdog every 1 minute (pharmacy + cashflow + Funnel)" | Out-Null

Write-Host "Running boot once..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File $BootScript

Write-Host ""
Write-Host "=== Auto-start ENABLED ===" -ForegroundColor Green
Write-Host "  Task: $BootTask (AtLogOn + AtStartup+2min)"
Write-Host "  Task: $WatchdogTask (every 1 minute)"
Write-Host "  Removed legacy: YaoshengPharmacyWatchdog / FunnelWatchdog (avoid funnel reset thrash)"
Write-Host "  Logs: $ProjectRoot\data\logs\docker-boot.log"
Write-Host "  Logs: $ProjectRoot\data\logs\docker-watchdog.log"
Write-Host ""
Write-Host "Manual checklist:" -ForegroundColor Yellow
Write-Host "  1) Docker Desktop -> Start when you log in"
Write-Host "  2) Win+R netplwiz -> enable Windows auto logon"
Write-Host "  3) Keep Tailscale signed in"
Write-Host "  4) Do not run funnel reset repeatedly; use scripts\windows-cleanup-funnel-conflicts.ps1 once if needed"
Write-Host ""
pause
