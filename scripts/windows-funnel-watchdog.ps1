# 每 15 分鐘檢查外網 Funnel + 本機 :3000，異常時自動修復
# 由排程工作執行，不需人工介入
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-watchdog.log"
$npm = "C:\Program Files\nodejs\npm.cmd"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-PortListening([int]$Port) {
    return [bool](netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING")
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

function Repair-Site {
    if (Test-PortListening 3000) { return }
    Write-Log "Port 3000 down, starting npm start..."
    Start-Process -FilePath $npm -ArgumentList "start" -WorkingDirectory $ProjectRoot -WindowStyle Hidden
    Start-Sleep -Seconds 10
}

Write-Log "Watchdog check start"

Repair-Site

$funnelUrl = Get-FunnelUrl
$funnelStatus = (tailscale funnel status 2>&1 | Out-String)
$funnelConfigured = $funnelStatus -match "Funnel on" -and $funnelStatus -match "127\.0\.0\.1:3000"
$healthy = $funnelConfigured -and (Test-FunnelHealthy $funnelUrl)

if ($healthy) {
    Write-Log "OK: $funnelUrl"
    exit 0
}

Write-Log "UNHEALTHY funnelConfigured=$funnelConfigured url=$funnelUrl"
Repair-Funnel

Start-Sleep -Seconds 5
$funnelUrl = Get-FunnelUrl
if (Test-FunnelHealthy $funnelUrl) {
    Write-Log "Repaired OK: $funnelUrl"
    exit 0
}

Write-Log "Repair failed; run scripts\重開機後啟動.bat as Administrator"
exit 1
