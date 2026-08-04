# 註冊 Docker+PM2 開機啟動 + 每分鐘監測重啟（排班 + 金流 雙站常駐）
# 系統管理員執行一次即可：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-register-startup-task.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $ProjectRoot "scripts\windows-docker-boot.ps1"
$WatchdogScript = Join-Path $ProjectRoot "scripts\windows-funnel-watchdog.ps1"
$StartTaskName = "YaoshengPharmacyStart"
$WatchdogTaskName = "YaoshengPharmacyWatchdog"

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
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -MultipleInstances IgnoreNew

# 開機後 3 分鐘 + 登入時：Docker Supabase + PM2（排班+金流）+ Funnel 雙埠
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
    -Description "Yaosheng: Docker Supabase + PM2 pharmacy-web + cashflow + Tailscale Funnel :3000/:8443"

# 每 1 分鐘：雙站 + Auth + Funnel，掛掉自動修（長期重複，避免到期後停止）
$watchdogAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$WatchdogScript`""

$triggerWatchdog = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 9999)

$watchdogSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 12) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

Unregister-ScheduledTask -TaskName $WatchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName $WatchdogTaskName `
    -Action $watchdogAction `
    -Trigger $triggerWatchdog `
    -Principal $startPrincipal `
    -Settings $watchdogSettings `
    -Description "Yaosheng: every 1 min keep pharmacy-web + cashflow + Auth + Funnel :3000/:8443 alive"

Write-Host ""
Write-Host "Registered tasks (dual-site always-on):" -ForegroundColor Green
Write-Host "  $StartTaskName  — AtStartup (+3min) + AtLogon  → windows-docker-boot.ps1"
Write-Host "  $WatchdogTaskName — every 1 minute → windows-funnel-watchdog.ps1"
Write-Host ""
Write-Host "Monitors / restarts:" -ForegroundColor Cyan
Write-Host "  - pharmacy-web  (:3000) + Funnel"
Write-Host "  - cashflow      (:8443) + Funnel"
Write-Host "  - Supabase Auth (:54321)"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $ProjectRoot\data\logs\docker-boot.log"
Write-Host "  $ProjectRoot\data\logs\funnel-watchdog.log"
Write-Host ""
Write-Host "One-time: ensure cashflow is in PM2 and saved:" -ForegroundColor Yellow
Write-Host "  cd C:\cash-flow-app"
Write-Host "  pm2 start ... --name cashflow"
Write-Host "  pm2 save"
Write-Host "  pm2 startup   # 開機自動 resurrect"
Write-Host ""
Write-Host "One-time fix if login fails (old Hyper-V portproxy):" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-clear-portproxy.ps1"
Write-Host ""
Write-Host "Test watchdog now:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-funnel-watchdog.ps1"
Write-Host "  pm2 status"
Write-Host "  tailscale funnel status"
