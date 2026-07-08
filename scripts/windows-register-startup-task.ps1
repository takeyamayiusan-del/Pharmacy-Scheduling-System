# Register auto-start + funnel watchdog (Task Scheduler)
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-register-startup-task.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $ProjectRoot "scripts\windows-start-all.ps1"
$WatchdogScript = Join-Path $ProjectRoot "scripts\windows-funnel-watchdog.ps1"
$StartTaskName = "YaoshengPharmacyStart"
$WatchdogTaskName = "YaoshengPharmacyWatchdog"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

# 開機後 3 分鐘 + 登入時 各跑一次完整啟動
$triggerStartup = New-ScheduledTaskTrigger -AtStartup
$triggerStartup.Delay = "PT3M"
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn

$startAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

# SYSTEM 帳號：重開機無需有人登入也會執行
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
    -Description "Yaosheng pharmacy: VM + Supabase proxy + Next.js + Tailscale Funnel"

# 每 1 分鐘檢查本機網站與外網 Funnel，掛掉自動修復並持續保溫
$watchdogAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogScript`""

$triggerWatchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$watchdogSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Unregister-ScheduledTask -TaskName $WatchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName $WatchdogTaskName `
    -Action $watchdogAction `
    -Trigger $triggerWatchdog `
    -Principal $startPrincipal `
    -Settings $watchdogSettings `
    -Description "Yaosheng pharmacy: auto-repair local site + Tailscale Funnel every 1 minute"

$vm = Get-VM -Name "yaosheng-supabase" -ErrorAction SilentlyContinue
if ($vm) {
    Set-VM -Name "yaosheng-supabase" -AutomaticStartAction Start -AutomaticStartDelay 10
    Write-Host "Hyper-V VM auto-start: enabled" -ForegroundColor Green
}

Write-Host ""
Write-Host "Registered tasks:" -ForegroundColor Green
Write-Host "  $StartTaskName  — AtStartup (+3min) + AtLogon"
Write-Host "  $WatchdogTaskName — every 1 minute (site + funnel + warmup)"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $ProjectRoot\data\logs\funnel-watchdog.log"
Write-Host "  $ProjectRoot\data\logs\site-runner.log"
Write-Host ""
Write-Host "Test watchdog now:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-funnel-watchdog.ps1"
