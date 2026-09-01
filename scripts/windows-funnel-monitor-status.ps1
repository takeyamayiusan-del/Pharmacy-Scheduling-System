# 外網 Funnel 監控快速診斷（排程、常駐程序、狀態檔、公開探測）
#   powershell -ExecutionPolicy Bypass -File scripts\windows-funnel-monitor-status.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot

function Write-Row([string]$Label, [string]$Value, [string]$Color = "White") {
    Write-Host ("  {0,-24} {1}" -f $Label, $Value) -ForegroundColor $Color
}

Write-Host "=== Funnel public monitor status ===" -ForegroundColor Cyan
Write-Host ""

$taskName = Get-FunnelMonitorTaskName
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Row "Scheduled task" "MISSING ($taskName)" "Red"
    Write-Host ""
    Write-Host "Register:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
    exit 1
}

Write-Row "Scheduled task" ("{0} state={1}" -f $taskName, $task.State) $(if ($task.State -eq "Ready" -or $task.State -eq "Running") { "Green" } else { "Yellow" })
$info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
if ($info -and $info.LastRunTime) {
    Write-Row "Task last run" ("{0} result={1}" -f $info.LastRunTime, $info.LastTaskResult) "DarkGray"
}

$alive = Test-FunnelMonitorAlive -ProjectRoot $ProjectRoot
$aliveColor = if ($alive.Alive) { "Green" } else { "Red" }
Write-Row "Monitor alive" ("{0} ({1})" -f $(if ($alive.Alive) { "YES" } else { "NO" }), $alive.Reason) $aliveColor
if ($null -ne $alive.StatusAgeSec) {
    $maxStale = Get-FunnelMonitorMaxStaleSeconds
    $ageColor = if ($alive.StatusAgeSec -le $maxStale) { "Green" } else { "Red" }
    Write-Row "Status file age" ("{0}s (max {1}s)" -f $alive.StatusAgeSec, $maxStale) $ageColor
} else {
    Write-Row "Status file age" "no snapshot yet" "Yellow"
}
Write-Row "Monitor PID" $(if ($alive.MonitorPid) { $alive.MonitorPid } else { "(none)" }) "DarkGray"
Write-Row "Monitor processes" $alive.ProcessCount "DarkGray"

$statusPath = Get-FunnelPublicStatusPath -ProjectRoot $ProjectRoot
if (Test-Path -LiteralPath $statusPath) {
    try {
        $fs = (Get-Content -LiteralPath $statusPath -Raw) | ConvertFrom-Json
        Write-Row "Last publicOk" $(if ($fs.publicOk) { "OK" } else { "DOWN" }) $(if ($fs.publicOk) { "Green" } else { "Red" })
        Write-Row "Last checkedAt" $fs.checkedAt "DarkGray"
        Write-Row "Public URL" $fs.publicUrl "DarkGray"
        Write-Row "Incidents" $fs.totalIncidents "DarkGray"
        if ($fs.lastRepairAction -and $fs.lastRepairAction -ne "none") {
            Write-Row "Last repair" ("{0} at {1}" -f $fs.lastRepairAction, $fs.lastRepairAt) "Yellow"
        }
    } catch {
        Write-Row "Status file" "invalid JSON" "Red"
    }
} else {
    Write-Row "Status file" "missing" "Yellow"
}

Write-Host ""
Write-Host "[Live probe]" -ForegroundColor Cyan
$tsState = Get-TailscaleBackendState
Write-Row "Tailscale" $tsState $(if ($tsState -eq "Running") { "Green" } else { "Yellow" })
$routes = Test-FunnelRoutesConfigured
Write-Row "Routes 443/8443" ("{0}/{1}" -f $(if ($routes.Pharmacy) { "OK" } else { "MISS" }), $(if ($routes.Cashflow) { "OK" } else { "MISS" })) $(if ($routes.Ok) { "Green" } else { "Red" })
$localOk = Test-HttpOk -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5
if (-not $localOk) { $localOk = Test-HttpOk -Uri "http://127.0.0.1:3000/login" -TimeoutSec 5 }
Write-Row "Local pharmacy" $(if ($localOk) { "OK" } else { "DOWN" }) $(if ($localOk) { "Green" } else { "Red" })
$publicOk = Test-FunnelPublicOk
Write-Row "Public URL now" $(if ($publicOk) { "OK" } else { "DOWN" }) $(if ($publicOk) { "Green" } else { "Red" })

$logFile = Join-Path $ProjectRoot "data\logs\funnel-public-monitor.log"
Write-Host ""
Write-Host "[Recent log]" -ForegroundColor Cyan
if (Test-Path -LiteralPath $logFile) {
    Get-Content -LiteralPath $logFile -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "  $_" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  (no log yet)" -ForegroundColor DarkGray
}

Write-Host ""
if (-not $alive.Alive) {
    Write-Host "Monitor not alive. Restart:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-register-keepalive-simple.ps1"
    Write-Host "Or one-shot repair:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1"
    exit 1
}
if (-not $publicOk) {
    Write-Host "Monitor is running but public URL is DOWN." -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1"
    exit 1
}

Write-Host "Monitor OK and public URL reachable." -ForegroundColor Green
exit 0
