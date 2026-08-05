# 每 1 分鐘檢查：本機網站 + Supabase Auth + Tailscale Funnel，異常自動修復
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

function Warmup-SiteRoutes {
    param([string]$BaseUrl)

    $targets = @("http://127.0.0.1:3000/", "http://127.0.0.1:3000/login")
    if ($BaseUrl) {
        $targets += "$BaseUrl/"
        $targets += "$BaseUrl/login"
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
    Write-Log "Repairing Tailscale Funnel..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\windows-tailscale-funnel-setup.ps1") *>> $LogFile
}

Write-Log "Watchdog check start"

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
    Write-Log "Local site still unhealthy after repair"
} elseif (-not (Test-PharmacyWebPm2OwningPort)) {
    Write-Log "Site HTTP OK but PM2 does not own :3000 — forcing repair"
    $siteOk = Restart-PharmacyWebPm2 -ProjectRoot $ProjectRoot -WriteLog {
        param($m)
        Write-Log $m
    }
    if (-not $siteOk) {
        Write-Log "Forced pharmacy-web repair failed"
    }
}

$cashflowOk = $true
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $hasCashflow = ((& pm2 jlist 2>$null) | Out-String) -match '"name"\s*:\s*"cashflow"'
    if ($hasCashflow) {
        $cashflowOk = Repair-Pm2AppIfNeeded -Name "cashflow" -ProjectRoot $ProjectRoot -HealthyCheck { Test-CashflowHealthy -ProjectRoot $ProjectRoot } -WriteLog {
            param($m)
            Write-Log $m
        }
        if (-not $cashflowOk) {
            Write-Log "cashflow still unhealthy after repair"
        }
    }
}

$funnelUrl = Get-FunnelUrl
$funnelStatus = (tailscale funnel status 2>&1 | Out-String)
$cashflowPort = Get-CashflowHealthPort -ProjectRoot $ProjectRoot
$hasCashflowInPm2 = $false
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $hasCashflowInPm2 = ((& pm2 jlist 2>$null) | Out-String) -match '"name"\s*:\s*"cashflow"'
}
# 純文字 status 常只印 443；用 JSON 判斷雙入口，避免誤判後 reset 清掉 8443
$funnelPharmacyOk = (Test-FunnelProxyConfigured -LocalPort 3000 -PublicHttpsPort 443) -or (Test-FunnelProxyConfigured -LocalPort 3000)
$funnelCashflowOk = (-not $hasCashflowInPm2) -or (Test-FunnelProxyConfigured -LocalPort $cashflowPort -PublicHttpsPort 8443) -or (Test-FunnelProxyConfigured -LocalPort $cashflowPort)
$funnelConfigured = $funnelPharmacyOk -and $funnelCashflowOk
if (-not $funnelConfigured) {
    Write-Log "Funnel routes incomplete pharmacyOk=$funnelPharmacyOk cashflowOk=$funnelCashflowOk (text status may hide :8443)"
}
$healthy = $authOk -and $siteOk -and $cashflowOk -and $funnelConfigured -and (Test-FunnelHealthy $funnelUrl)

if ($healthy) {
    Warmup-SiteRoutes -BaseUrl $funnelUrl
    Write-Log "OK: auth + pharmacy-web + cashflow + $funnelUrl"
    exit 0
}

Write-Log "UNHEALTHY authOk=$authOk siteOk=$siteOk cashflowOk=$cashflowOk funnelConfigured=$funnelConfigured url=$funnelUrl"
Repair-Funnel

Start-Sleep -Seconds 5
$funnelUrl = Get-FunnelUrl
if ($authOk -and $siteOk -and (Test-FunnelHealthy $funnelUrl)) {
    Warmup-SiteRoutes -BaseUrl $funnelUrl
    Write-Log "Repaired OK: $funnelUrl"
    exit 0
}

Write-Log "Repair failed; run scripts\windows-docker-boot.ps1 (and scripts\windows-clear-portproxy.ps1 if Auth=000)"
exit 1
