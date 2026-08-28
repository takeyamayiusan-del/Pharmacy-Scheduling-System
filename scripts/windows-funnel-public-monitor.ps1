# 外網 Funnel 專用常駐監測：每 30 秒探測公開網址，內網通但外網不通時自動重宣告／reset。
# 預設常駐執行（開機／登入排程啟動）。單次測試：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-funnel-public-monitor.ps1 -Once
# 狀態快照：data\ops\funnel-public-status.json
# 紀錄：data\logs\funnel-public-monitor.log

param(
    [switch]$Once,
    [int]$IntervalSec = 30
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-public-monitor.log"

function Write-MonitorLog([string]$Message, [switch]$Always) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    if ($Always) {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
        return
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-PharmacyLocalQuick {
    if (Test-HttpOk -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5) { return $true }
    return (Test-HttpOk -Uri "http://127.0.0.1:3000/login" -TimeoutSec 5)
}

function Invoke-FunnelPublicMonitorOnce {
    $healthState = Read-KeepaliveHealthState -ProjectRoot $ProjectRoot
    $localOk = Test-PharmacyLocalQuick
    $routesBefore = Test-FunnelRoutesConfigured
    $publicBefore = Test-FunnelPublicOk -NoRetry
    $beforeReapply = [string]$healthState.lastFunnelReapplyAt
    $beforeReset = [string]$healthState.lastFunnelResetAt

    $publicOk = Repair-FunnelIfNeeded `
        -WriteLog {
            param($m)
            if ($m -match '^funnel check .* public=True localOk=True fails=0/') { return }
            if ($m -match '^tailscale BackendState=Running$') { return }
            Write-MonitorLog $m
        } `
        -LocalOk $localOk `
        -MinPublicFails 1 `
        -CooldownMinutes 3 `
        -ResetCooldownMinutes 10 `
        -AllowReset `
        -HealthState $healthState

    $repairAction = "none"
    if ([string]$healthState.lastFunnelResetAt -and [string]$healthState.lastFunnelResetAt -ne $beforeReset) {
        $repairAction = "reset"
    } elseif ([string]$healthState.lastFunnelReapplyAt -and [string]$healthState.lastFunnelReapplyAt -ne $beforeReapply) {
        $repairAction = "reapply"
    } elseif (-not $publicBefore -and $publicOk) {
        $repairAction = "recovered"
    } elseif (-not $publicBefore -and -not $publicOk) {
        $repairAction = "still_down"
    }

    Save-KeepaliveHealthState -ProjectRoot $ProjectRoot -State $healthState
    $status = Save-FunnelPublicStatus `
        -ProjectRoot $ProjectRoot `
        -PublicOk $publicOk `
        -RoutesOk $routesBefore.Ok `
        -LocalOk $localOk `
        -PublicFails ([int]$healthState.publicFails) `
        -RepairAction $repairAction `
        -Recovered ($publicOk -and -not $publicBefore)

    if ($Once) {
        Write-Host "=== Funnel public monitor (once) ===" -ForegroundColor Cyan
        Write-Host ("  local pharmacy   {0}" -f $(if ($localOk) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($localOk) { "Green" } else { "Red" })
        Write-Host ("  funnel public    {0}" -f $(if ($publicOk) { "OK" } else { "FAIL" })) -ForegroundColor $(if ($publicOk) { "Green" } else { "Red" })
        Write-Host ("  url              {0}" -f $status.publicUrl) -ForegroundColor DarkGray
        Write-Host ("  status file      {0}" -f (Get-FunnelPublicStatusPath -ProjectRoot $ProjectRoot)) -ForegroundColor DarkGray
        Write-Host ("  log              {0}" -f $LogFile) -ForegroundColor DarkGray
    }

    if (-not $publicOk -or $repairAction -ne "none") {
        Write-MonitorLog ("check local=$localOk public=$publicOk action=$repairAction fails=$($healthState.publicFails) url=$($status.publicUrl)")
    }

    if ($publicOk) { return 0 }
    return 1
}

if ($Once) {
    exit (Invoke-FunnelPublicMonitorOnce)
}

Write-MonitorLog "resident start interval=${IntervalSec}s" -Always
$heartbeatEvery = [Math]::Max(1, [int](300 / $IntervalSec))
$tick = 0
while ($true) {
    $tick++
    try {
        $code = Invoke-FunnelPublicMonitorOnce
        if ($code -ne 0 -or ($tick % $heartbeatEvery) -eq 0) {
            Write-MonitorLog ("heartbeat tick=$tick exit=$code")
        }
    } catch {
        Write-MonitorLog ("ERROR: $($_.Exception.Message)")
    }
    Start-Sleep -Seconds $IntervalSec
}
