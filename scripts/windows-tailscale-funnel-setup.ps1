# Tailscale Funnel setup (idempotent). ASCII-only for Windows PowerShell 5.1.
# Default: ensure mounts only (no reset). Use -ForceReset only for recovery.
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1 -ForceReset

param(
  [switch]$ForceReset
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-sites.config.ps1")
. (Join-Path $PSScriptRoot "windows-funnel-ensure.ps1")

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-setup.log"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    throw "tailscale not found. Install Tailscale first."
}

$primaryPort = [int]$Global:YaoshengHostConfig.PrimaryFunnelPort
Write-Host "=== Tailscale Funnel (multi-site, idempotent) ===" -ForegroundColor Cyan
Write-Log "Funnel setup start (primary=$primaryPort forceReset=$ForceReset)"

$portOk = [bool](netstat -ano | Select-String ":$primaryPort\s" | Select-String "LISTENING")
if (-not $portOk) {
    Write-Host "  Port $primaryPort not listening - start sites first (START-NOW.bat)" -ForegroundColor Red
    Write-Log "Aborted: port $primaryPort not listening"
    throw "Port $primaryPort not listening"
}

if ($ForceReset) {
    Write-Host "  ForceReset: clearing funnel/serve once..." -ForegroundColor Yellow
    Write-Log "ForceReset funnel/serve"
    tailscale funnel reset 2>$null
    tailscale serve reset 2>$null
}

$status = Ensure-YaoshengFunnelMounts -HostConfig $Global:YaoshengHostConfig -Sites $Global:YaoshengSites -Log {
  param($m)
  Write-Log $m
  Write-Host "  $m"
}

Write-Host $status
Write-Log $status.Trim()

if ($status -notmatch "Funnel on") {
    Write-Log "ERROR: Funnel not active"
    throw "Tailscale Funnel failed to start"
}

$hostName = Get-YaoshengFunnelHost -StatusText $status
if (-not $hostName) { $hostName = "chiaho-pharmacy.tail7f62d0.ts.net" }

Write-Host ""
Write-Host "Pharmacy: https://$hostName/login" -ForegroundColor Yellow
Write-Host "Cashflow: https://$hostName`:8443/" -ForegroundColor Yellow
Write-Host "NOTE: Repeated runs only ensure mounts; they do not stack duplicates." -ForegroundColor Cyan
Write-Host "NOTE: Test on phone 4G. Host curl of funnel URL can be misleading." -ForegroundColor Cyan
