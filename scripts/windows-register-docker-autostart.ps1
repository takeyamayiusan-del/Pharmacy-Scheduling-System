# 註冊 Docker 方案的開機啟動 + 每分鐘守護
# 請用系統管理員執行，或由 ENABLE-AUTO-START.bat 啟動
$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "需要系統管理員權限，正在提權..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BootScript = Join-Path $ProjectRoot "scripts\windows-docker-boot.ps1"
$WatchdogScript = Join-Path $ProjectRoot "scripts\windows-docker-watchdog.ps1"
$BootTask = "YaoshengDockerBoot"
$WatchdogTask = "YaoshengDockerWatchdog"

if (-not (Test-Path $BootScript)) { throw "找不到 $BootScript" }
if (-not (Test-Path $WatchdogScript)) { throw "找不到 $WatchdogScript" }

# 用目前登入使用者（Docker Desktop 需要使用者工作階段）
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
    -Description "耀聖藥局：Docker + Supabase + 網站 + Funnel 自動啟動" |
    Out-Null

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

Register-ScheduledTask `
    -TaskName $WatchdogTask `
    -Action $watchAction `
    -Trigger $watchTrigger `
    -Principal $principal `
    -Settings $watchSettings `
    -Description "耀聖藥局：每分鐘檢查網站／Supabase／Funnel 並自動修復" |
    Out-Null

# 立刻跑一次 boot + 確保 pm2
Write-Host "正在執行一次啟動..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File $BootScript

Write-Host ""
Write-Host "=== 已啟用自動啟動 ===" -ForegroundColor Green
Write-Host "  排程: $BootTask （登入時 + 開機後 2 分鐘）"
Write-Host "  排程: $WatchdogTask （每 1 分鐘守護）"
Write-Host "  日誌: $ProjectRoot\data\logs\docker-boot.log"
Write-Host "  日誌: $ProjectRoot\data\logs\docker-watchdog.log"
Write-Host ""
Write-Host "還需要手動確認：" -ForegroundColor Yellow
Write-Host "  1) Docker Desktop → Start when you log in"
Write-Host "  2) Windows 自動登入（netplwiz）— 斷電重開無人按鍵也能進桌面"
Write-Host "  3) Tailscale 保持登入／開機自動連線"
Write-Host ""
pause
