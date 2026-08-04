# Tailscale Funnel: pharmacy :3000 + cashflow (:5000 or :8443 if listening)
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-setup.log"

. (Join-Path $PSScriptRoot "windows-site-common.ps1")

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    throw "tailscale not found. Install Tailscale first."
}

Write-Host "=== Tailscale Funnel (pharmacy + cashflow) ===" -ForegroundColor Cyan
Write-Log "Funnel setup start"

if (-not (Test-PortListening 3000)) {
    Write-Host "  Port 3000 not listening - start pharmacy-web first" -ForegroundColor Red
    Write-Log "Aborted: port 3000 not listening"
    throw "Port 3000 not listening"
}

$cashflowPort = $null
foreach ($p in @(5000, 8443)) {
    if (Test-PortListening $p) { $cashflowPort = $p; break }
}
if ($cashflowPort) {
    Write-Host "  Detected cashflow on :$cashflowPort" -ForegroundColor Yellow
    Write-Log "Cashflow :$cashflowPort listening; dual Funnel"
} else {
    Write-Log "Cashflow not listening; Funnel pharmacy only"
}

tailscale funnel reset 2>$null
tailscale serve reset 2>$null

$setupOut = (tailscale funnel --bg --yes 3000 2>&1 | Out-String)
Write-Log ("pharmacy funnel: " + $setupOut.Trim())

if ($cashflowPort) {
    $cfOut = (tailscale funnel --bg --yes $cashflowPort 2>&1 | Out-String)
    Write-Log ("cashflow funnel :$cashflowPort : " + $cfOut.Trim())
    Write-Host $cfOut
}

Start-Sleep -Seconds 3
$statusOut = (tailscale funnel status 2>&1 | Out-String)
Write-Host $statusOut
Write-Log $statusOut.Trim()

if ($statusOut -notmatch "Funnel on") {
    Write-Log "ERROR: Funnel not active"
    throw "Tailscale Funnel failed to start"
}

if ($statusOut -notmatch "127\.0\.0\.1:3000") {
    throw "Tailscale Funnel missing pharmacy :3000"
}

if ($cashflowPort -and $statusOut -notmatch ("127\.0\.0\.1:" + $cashflowPort)) {
    Write-Host "  Warning: Funnel missing cashflow :$cashflowPort - retry" -ForegroundColor Yellow
    [void](tailscale funnel --bg --yes $cashflowPort 2>&1)
    Start-Sleep -Seconds 2
    $statusOut = (tailscale funnel status 2>&1 | Out-String)
    Write-Log $statusOut.Trim()
}

$url = $null
if ($statusOut -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }

Write-Host ""
Write-Host "Pharmacy: $url/login" -ForegroundColor Yellow
if ($cashflowPort -and $url) {
    Write-Host "Cashflow: ${url}:${cashflowPort}/" -ForegroundColor Yellow
}
Write-Host "Local:    pm2 status / tailscale funnel status"
