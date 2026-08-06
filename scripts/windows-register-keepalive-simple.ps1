# 註冊「簡單保活」排程（取代會亂 reset 的舊 watchdog）
# 管理員執行一次：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$KeepaliveScript = Join-Path $ProjectRoot "scripts\windows-keepalive-simple.ps1"
$BootScript = Join-Path $ProjectRoot "scripts\windows-docker-boot.ps1"
$KeepaliveTaskName = "YaoshengPharmacyWatchdog"
$StartTaskName = "YaoshengPharmacyStart"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit 0
}

if (-not (Test-Path -LiteralPath $KeepaliveScript)) {
    throw "Missing: $KeepaliveScript"
}

Write-Host "=== Register simple keepalive ===" -ForegroundColor Cyan
Write-Host "This replaces the old heavy watchdog (no git/build/funnel reset)."
Write-Host ""

# 停用並改掛簡單腳本
Stop-ScheduledTask -TaskName $KeepaliveTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $KeepaliveTaskName -Confirm:$false -ErrorAction SilentlyContinue

$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

$watchdogAction = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$KeepaliveScript`""

$triggerWatchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$watchdogSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName $KeepaliveTaskName `
    -Action $watchdogAction `
    -Trigger $triggerWatchdog `
    -Principal $principal `
    -Settings $watchdogSettings `
    -Description "Simple dual-site keepalive: PM2 pharmacy:3000 + cashflow:5000 + funnel (no reset)" | Out-Null

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
Write-Host "  $KeepaliveTaskName  → windows-keepalive-simple.ps1 (every 1 min)"
Write-Host "  $StartTaskName     → boot (if present)"
Write-Host ""
Write-Host "Test now:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-keepalive-simple.ps1"
Write-Host "Log:"
Write-Host "  $ProjectRoot\data\logs\keepalive-simple.log"
Write-Host ""
Write-Host "Updates: MANUAL only"
Write-Host "  cashflow:  `$env:PORT=5000; cd C:\cash-flow-app; git pull; pm2 restart cashflow --update-env"
Write-Host "  pharmacy:  `$env:PORT=3000; cd C:\Pharmacy-Scheduling-System; git pull; pm2 stop pharmacy-web; npm run build; pm2 restart pharmacy-web --update-env"
