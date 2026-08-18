# 註冊「簡單保活」排程（取代會亂 reset 的舊 watchdog）
# 管理員執行一次：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$KeepaliveScript = Join-Path $ProjectRoot "scripts\windows-keepalive-simple.ps1"
$BootScript = Join-Path $ProjectRoot "scripts\windows-docker-boot.ps1"
$KeepaliveTaskName = "YaoshengPharmacyWatchdog"
$StartTaskName = "YaoshengPharmacyStart"

. (Join-Path $PSScriptRoot "windows-site-common.ps1")

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

Import-Pm2Environment -ProjectRoot $ProjectRoot
$ctxPath = Save-KeepaliveContext -ProjectRoot $ProjectRoot
$runAs = Get-CurrentWindowsUser
if ($runAs -match '\\SYSTEM$' -or $runAs -eq "NT AUTHORITY\SYSTEM") {
    throw "Do not register keepalive as SYSTEM. Sign in as the pharmacy Windows account, then run this script."
}

if (-not (Test-Path -LiteralPath $KeepaliveScript)) {
    throw "Missing: $KeepaliveScript"
}

Write-Host "=== Register simple keepalive ===" -ForegroundColor Cyan
Write-Host "This replaces the old heavy watchdog (no git/build/funnel reset)."
Write-Host "Run as: $runAs (Interactive Limited — same PM2 as a normal PowerShell window)"
Write-Host "PM2 context: $ctxPath"
Write-Host ""

# 停用並改掛簡單腳本
Stop-ScheduledTask -TaskName $KeepaliveTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $KeepaliveTaskName -Confirm:$false -ErrorAction SilentlyContinue

# Interactive + Limited：與你在一般 PowerShell 裡的 pm2 是同一個 daemon。
# Highest（系統管理員）會變成另一個 PM2，健康檢查會誤報 not online。
$principal = New-ScheduledTaskPrincipal `
    -UserId $runAs `
    -LogonType Interactive `
    -RunLevel Limited

$watchdogAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$KeepaliveScript`""

$watchdogSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName $KeepaliveTaskName `
    -Action $watchdogAction `
    -Trigger (New-YaoshengMinuteWatchdogTriggers) `
    -Principal $principal `
    -Settings $watchdogSettings `
    -Description "Simple dual-site keepalive: PM2 pharmacy:3000 + cashflow:5000 + funnel (survives reboot)" | Out-Null

Enable-ScheduledTask -TaskName $KeepaliveTaskName | Out-Null
Start-ScheduledTask -TaskName $KeepaliveTaskName -ErrorAction SilentlyContinue

# 開機任務若已存在就啟用；不存在才註冊（仍用 docker-boot，但日常監控用簡單腳本）
$startExisting = Get-ScheduledTask -TaskName $StartTaskName -ErrorAction SilentlyContinue
if (-not $startExisting) {
    if (Test-Path -LiteralPath $BootScript) {
        $triggerStartup = New-ScheduledTaskTrigger -AtStartup
        $triggerStartup.Delay = "PT3M"
        $triggerLogon = New-ScheduledTaskTrigger -AtLogOn
        $startAction = New-ScheduledTaskAction -Execute "powershell.exe" `
            -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$BootScript`""
        $startSettings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -ExecutionTimeLimit (New-TimeSpan -Hours 2)
        Register-ScheduledTask `
            -TaskName $StartTaskName `
            -Action $startAction `
            -Trigger @($triggerStartup, $triggerLogon) `
            -Principal $principal `
            -Settings $startSettings `
            -Description "Boot: Docker/Supabase + PM2 resurrect" | Out-Null
    }
} else {
    Enable-ScheduledTask -TaskName $StartTaskName -ErrorAction SilentlyContinue | Out-Null
}

Write-Host ""
Write-Host "Registered:" -ForegroundColor Green
Write-Host "  $KeepaliveTaskName  → windows-keepalive-simple.ps1 as $runAs (Daily/1min + boot/logon)"
Write-Host "  $StartTaskName     → boot (if present)"
Write-Host ""
Write-Host "Test now:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-keepalive-simple.ps1"
Write-Host "Log:"
Write-Host "  $ProjectRoot\data\logs\keepalive-simple.log"
Write-Host "Then:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-health-check.ps1"
Write-Host ""
Write-Host "Updates: MANUAL only"
Write-Host "  cashflow:  `$env:PORT=5000; cd C:\cash-flow-app; git pull; pm2 restart cashflow --update-env"
Write-Host "  pharmacy:  `$env:PORT=3000; cd C:\Pharmacy-Scheduling-System; git pull; pm2 stop pharmacy-web; npm run build; pm2 restart pharmacy-web --update-env"
