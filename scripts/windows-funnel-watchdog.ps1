# 每 1 分鐘檢查：排班 + 金流 + Supabase Auth + Tailscale Funnel（雙埠），異常自動修復
# 目標：兩個網站盡量永遠在線；掛掉下一分鐘內自動拉起。
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-watchdog.log"

. (Join-Path $PSScriptRoot "windows-site-common.ps1")

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Get-FunnelUrl {
    $status = (tailscale funnel status 2>&1 | Out-String)
    if ($status -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') {
        return $Matches[1]
    }
    $status2 = (tailscale status 2>&1 | Out-String)
    if ($status2 -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') {
        return $Matches[1]
    }
    return $null
}

function Test-FunnelHealthy([string]$BaseUrl) {
    if (-not $BaseUrl) { return $false }
    return (Test-HttpOk -Uri "$BaseUrl/login" -TimeoutSec 8)
}

function Test-CashflowFunnelConfigured([string]$FunnelStatus) {
    return (
        $FunnelStatus -match "Funnel on" -and (
            $FunnelStatus -match "127\.0\.0\.1:5000" -or
            $FunnelStatus -match "127\.0\.0\.1:8443"
        )
    )
}

function Test-PharmacyFunnelConfigured([string]$FunnelStatus) {
    return ($FunnelStatus -match "Funnel on" -and $FunnelStatus -match "127\.0\.0\.1:3000")
}

function Warmup-SiteRoutes {
    param([string]$BaseUrl)

    $targets = @(
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/login"
    )
    if (Test-PortListening 5000) {
        $targets += "http://127.0.0.1:5000/"
    } elseif (Test-PortListening 8443) {
        $targets += "http://127.0.0.1:8443/"
    }
    if ($BaseUrl) {
        $targets += "$BaseUrl/"
        $targets += "$BaseUrl/login"
        if (Test-PortListening 5000) {
            $targets += "${BaseUrl}:5000/"
        } elseif (Test-PortListening 8443) {
            $targets += "${BaseUrl}:8443/"
        }
    }

    foreach ($uri in $targets) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $ok = Test-HttpOk -Uri $uri -TimeoutSec 8
        $sw.Stop()
        if ($ok) {
            Write-Log ("Warmup OK: {0} {1}ms" -f $uri, $sw.ElapsedMilliseconds)
        } else {
            Write-Log ("Warmup FAIL: {0} ({1}ms)" -f $uri, $sw.ElapsedMilliseconds)
        }
    }
}

function Repair-Funnel {
    Write-Log "Repairing Tailscale Funnel (pharmacy :3000 + cashflow :5000/:8443 if up)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\windows-tailscale-funnel-setup.ps1") *>> $LogFile
}

Write-Log "Watchdog check start (pharmacy-web + cashflow)"

$authOk = Repair-AuthIfNeeded -ProjectRoot $ProjectRoot -WriteLog {
    param($m)
    Write-Log $m
}
if (-not $authOk) {
    Write-Log "Auth still unhealthy after repair"
}

$siteOk = Repair-SiteIfNeeded -ProjectRoot $ProjectRoot -WriteLog {
    param($m)
    Write-Log $m
}
if (-not $siteOk) {
    Write-Log "Local pharmacy site still unhealthy after repair"
}

# 金流：有 PM2 就修；沒有但本機有金流目錄就自動新建並拉起
$cashflowOk = $true
$hasCashflow = $false
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $hasCashflow = Test-Pm2AppExists -Name "cashflow"
    $cashflowRoot = Get-CashflowAppRoot
    if ($hasCashflow -or $cashflowRoot) {
        if (-not $hasCashflow) {
            Write-Log "cashflow missing from pm2 - auto start from $cashflowRoot"
        }
        $cashflowOk = Repair-Pm2AppIfNeeded -Name "cashflow" -HealthyCheck { Test-CashflowHealthy } -WriteLog {
            param($m)
            Write-Log $m
        }
        if (-not $cashflowOk) {
            Write-Log "cashflow still unhealthy after repair - free :5000/:8443 and fresh start"
            Clear-ListeningPorts -Ports @(5000, 8443) -WriteLog { param($m) Write-Log $m }
            $cashflowOk = Start-CashflowPm2Fresh -WriteLog { param($m) Write-Log $m }
        }
        $hasCashflow = Test-Pm2AppExists -Name "cashflow"
        if (-not $cashflowOk) {
            Write-Log "cashflow still unhealthy after repair"
        }
    } else {
        if (Test-CashflowHealthy) {
            Write-Log "cashflow port healthy but not in pm2 list (ok)"
            $cashflowOk = $true
        } else {
            Write-Log "WARN: cashflow not configured (no pm2 / no C:\cash-flow-app)"
            $cashflowOk = $true
        }
    }
}

$funnelUrl = Get-FunnelUrl
$funnelStatus = (tailscale funnel status 2>&1 | Out-String)
$pharmacyFunnelOk = Test-PharmacyFunnelConfigured $funnelStatus
$needCashflowFunnel = $hasCashflow -or (Test-PortListening 5000) -or (Test-PortListening 8443)
$cashflowFunnelOk = if ($needCashflowFunnel) { Test-CashflowFunnelConfigured $funnelStatus } else { $true }
$funnelHttpOk = Test-FunnelHealthy $funnelUrl

$healthy = $authOk -and $siteOk -and $cashflowOk -and $pharmacyFunnelOk -and $cashflowFunnelOk -and $funnelHttpOk

if ($healthy) {
    Warmup-SiteRoutes -BaseUrl $funnelUrl
    Write-Log "OK: auth + pharmacy-web + cashflow + funnel3000 + funnelCash=$needCashflowFunnel + $funnelUrl"
    exit 0
}

Write-Log "UNHEALTHY authOk=$authOk siteOk=$siteOk cashflowOk=$cashflowOk pharmacyFunnelOk=$pharmacyFunnelOk cashflowFunnelOk=$cashflowFunnelOk url=$funnelUrl"
Repair-Funnel

Start-Sleep -Seconds 5
$funnelUrl = Get-FunnelUrl
$funnelStatus = (tailscale funnel status 2>&1 | Out-String)
$pharmacyFunnelOk = Test-PharmacyFunnelConfigured $funnelStatus
$cashflowFunnelOk = if ($needCashflowFunnel) { Test-CashflowFunnelConfigured $funnelStatus } else { $true }

if ($authOk -and $siteOk -and $cashflowOk -and $pharmacyFunnelOk -and $cashflowFunnelOk -and (Test-FunnelHealthy $funnelUrl)) {
    Warmup-SiteRoutes -BaseUrl $funnelUrl
    Write-Log "Repaired OK: pharmacy + cashflow + $funnelUrl"
    exit 0
}

Write-Log "Repair failed; run scripts\windows-docker-boot.ps1 (and scripts\windows-clear-portproxy.ps1 if Auth=000)"
exit 1
