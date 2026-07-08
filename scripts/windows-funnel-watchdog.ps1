# 每 3 分鐘檢查本機網站 + Tailscale Funnel，異常時自動修復
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
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/login" -UseBasicParsing -TimeoutSec 20
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Repair-Funnel {
    Write-Log "Repairing Tailscale Funnel..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\windows-tailscale-funnel-setup.ps1") *>> $LogFile
}

Write-Log "Watchdog check start"

$siteOk = Repair-SiteIfNeeded -ProjectRoot $ProjectRoot -WriteLog {
    param($m)
    Write-Log $m
}

if (-not $siteOk) {
    Write-Log "Local site still unhealthy after repair"
}

$funnelUrl = Get-FunnelUrl
$funnelStatus = (tailscale funnel status 2>&1 | Out-String)
$funnelConfigured = $funnelStatus -match "Funnel on" -and $funnelStatus -match "127\.0\.0\.1:3000"
$healthy = $siteOk -and $funnelConfigured -and (Test-FunnelHealthy $funnelUrl)

if ($healthy) {
    Write-Log "OK: local site + $funnelUrl"
    exit 0
}

Write-Log "UNHEALTHY siteOk=$siteOk funnelConfigured=$funnelConfigured url=$funnelUrl"
Repair-Funnel

Start-Sleep -Seconds 5
$funnelUrl = Get-FunnelUrl
if ($siteOk -and (Test-FunnelHealthy $funnelUrl)) {
    Write-Log "Repaired OK: $funnelUrl"
    exit 0
}

Write-Log "Repair failed; run scripts\windows-start-all.ps1 as Administrator"
exit 1
