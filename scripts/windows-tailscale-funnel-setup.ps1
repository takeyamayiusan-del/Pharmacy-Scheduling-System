# Tailscale Funnel: 排班 443→3000、現金帳 8443→5000（本機 HTTP）
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1
# 僅排班單入口：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1 -PharmacyOnly

param(
    [switch]$PharmacyOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-setup.log"
$CashflowLocalPort = 5000

. (Join-Path $PSScriptRoot "windows-site-common.ps1")
$CashflowLocalPort = Get-CashflowHealthPort -ProjectRoot $ProjectRoot

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    throw "tailscale not found. Install Tailscale first."
}

Write-Host "=== Tailscale Funnel ===" -ForegroundColor Cyan
Write-Log "Funnel setup start (PharmacyOnly=$PharmacyOnly)"

$port3000Ok = [bool](netstat -ano | Select-String ":3000\s" | Select-String "LISTENING")
if (-not $port3000Ok) {
    Write-Host "  Port 3000 not listening — start site first (pm2 restart pharmacy-web)" -ForegroundColor Red
    Write-Log "Aborted: port 3000 not listening"
    throw "Port 3000 not listening"
}

if (-not $PharmacyOnly) {
    $portCashflowOk = [bool](netstat -ano | Select-String (":$CashflowLocalPort\s") | Select-String "LISTENING")
    if (-not $portCashflowOk) {
        Write-Host "  Port $CashflowLocalPort not listening — start cashflow first (pm2 restart cashflow)" -ForegroundColor Red
        Write-Log "Aborted: port $CashflowLocalPort not listening"
        throw "Port $CashflowLocalPort not listening"
    }
}

tailscale funnel reset 2>$null
tailscale serve reset 2>$null

$setupOut = (tailscale funnel --bg --yes 3000 2>&1 | Out-String)
Write-Log ("pharmacy funnel: " + $setupOut.Trim())

if (-not $PharmacyOnly) {
    $cashflowOut = (tailscale funnel --bg --yes --https=8443 $CashflowLocalPort 2>&1 | Out-String)
    Write-Log ("cashflow funnel: " + $cashflowOut.Trim())
}

Start-Sleep -Seconds 3
$statusOut = (tailscale funnel status 2>&1 | Out-String)
Write-Host $statusOut
Write-Log $statusOut.Trim()

if ($statusOut -notmatch "Funnel on") {
    Write-Log "ERROR: Funnel not active"
    throw "Tailscale Funnel failed to start"
}

$pharmacyOk = $statusOut -match "127\.0\.0\.1:3000"
$cashflowOk = $PharmacyOnly -or ($statusOut -match "127\.0\.0\.1:$CashflowLocalPort")

if (-not $pharmacyOk) {
    Write-Host "  Warning: pharmacy funnel (→3000) may not be configured" -ForegroundColor Yellow
    Write-Log "Warning: missing proxy to 127.0.0.1:3000"
}
if (-not $PharmacyOnly -and -not $cashflowOk) {
    Write-Host "  Warning: cashflow funnel (8443→$CashflowLocalPort) may not be configured" -ForegroundColor Yellow
    Write-Log "Warning: missing proxy to 127.0.0.1:$CashflowLocalPort"
}

$url = $null
if ($statusOut -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }
if ($url) {
    try {
        $r = Invoke-WebRequest -Uri "$url/login" -UseBasicParsing -TimeoutSec 25
        if ($r.StatusCode -eq 200) {
            Write-Host "  External pharmacy check OK: $url/login" -ForegroundColor Green
            Write-Log "External pharmacy check OK: $url/login"
        }
    } catch {
        Write-Host "  External pharmacy check failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Log "External pharmacy check failed: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Pharmacy URL:  $url/login" -ForegroundColor Yellow
if (-not $PharmacyOnly) {
    Write-Host "Cashflow URL:  ${url}:8443/" -ForegroundColor Yellow
    Write-Host "  (Use a browser for :8443; curl on Windows may show TLS errors.)" -ForegroundColor DarkGray
}
