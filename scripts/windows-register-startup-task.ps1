# 註冊 Docker+PM2 開機啟動 + 每分鐘監測重啟（Task Scheduler）
# 系統管理員執行：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-register-startup-task.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $ProjectRoot "scripts\windows-docker-boot.ps1"
$WatchdogScript = Join-Path $ProjectRoot "scripts\windows-funnel-watchdog.ps1"
$StartTaskName = "YaoshengPharmacyStart"
$WatchdogTaskName = "YaoshengPharmacyWatchdog"

. (Join-Path $PSScriptRoot "windows-site-common.ps1")

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

# 開機後 3 分鐘 + 登入時：Docker Supabase + PM2 + Funnel
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$triggerStartup.Delay = "PT3M"
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$startAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

$startPrincipal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

Unregister-ScheduledTask -TaskName $StartTaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName $StartTaskName `
    -Action $startAction `
    -Trigger @($triggerStartup, $triggerLogon) `
    -Principal $startPrincipal `
    -Settings $settings `
    -Description "Yaosheng pharmacy: Docker Supabase + PM2 + Tailscale Funnel" | Out-Null

# 每 1 分鐘：本機網站 + Auth + Funnel（Daily+開機觸發，重開機後仍監聽）
$watchdogAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogScript`""

$watchdogSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Unregister-ScheduledTask -TaskName $WatchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName $WatchdogTaskName `
    -Action $watchdogAction `
    -Trigger (New-YaoshengMinuteWatchdogTriggers) `
    -Principal $startPrincipal `
    -Settings $watchdogSettings `
    -Description "Yaosheng pharmacy: auto-repair site + Supabase Auth + Funnel every 1 minute (survives reboot)" | Out-Null

Enable-ScheduledTask -TaskName $WatchdogTaskName | Out-Null
Start-ScheduledTask -TaskName $WatchdogTaskName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Registered tasks:" -ForegroundColor Green
Write-Host "  $StartTaskName  — AtStartup (+3min) + AtLogon  → windows-docker-boot.ps1"
Write-Host "  $WatchdogTaskName — Daily/1min + AtStartup/AtLogon → windows-funnel-watchdog.ps1"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $ProjectRoot\data\logs\docker-boot.log"
Write-Host "  $ProjectRoot\data\logs\funnel-watchdog.log"
Write-Host ""
Write-Host "One-time fix if login fails (old Hyper-V portproxy):" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1"
Write-Host ""
Write-Host "Test watchdog now:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-funnel-watchdog.ps1"
