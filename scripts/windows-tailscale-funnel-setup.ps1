# Tailscale Funnel (new CLI): expose Next.js only; API via next.config.js rewrites
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-setup.log"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    throw "tailscale not found. Install Tailscale first."
}

Write-Host "=== Tailscale Funnel ===" -ForegroundColor Cyan
Write-Log "Funnel setup start"

# 確保本機網站已起來
$portOk = [bool](netstat -ano | Select-String ":3000\s" | Select-String "LISTENING")
if (-not $portOk) {
    Write-Host "  Port 3000 not listening — start site first (pm2 restart pharmacy-web 或 scripts\windows-docker-boot.ps1)" -ForegroundColor Red
    Write-Log "Aborted: port 3000 not listening"
    throw "Port 3000 not listening"
}

tailscale funnel reset 2>$null
tailscale serve reset 2>$null

$setupOut = (tailscale funnel --bg --yes 3000 2>&1 | Out-String)
Write-Log $setupOut.Trim()

Start-Sleep -Seconds 3
$statusOut = (tailscale funnel status 2>&1 | Out-String)
Write-Host $statusOut
Write-Log $statusOut.Trim()

if ($statusOut -notmatch "Funnel on") {
    Write-Log "ERROR: Funnel not active"
    throw "Tailscale Funnel failed to start"
}

if ($setupOut -notmatch "Available on the internet" -and $statusOut -notmatch "proxy http://127\.0\.0\.1:3000") {
    Write-Host "  Warning: Funnel may not be public yet" -ForegroundColor Yellow
    Write-Log "Warning: missing 'Available on the internet'"
}

$url = $null
if ($statusOut -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }
if ($url) {
    try {
        $r = Invoke-WebRequest -Uri "$url/login" -UseBasicParsing -TimeoutSec 25
        if ($r.StatusCode -eq 200) {
            Write-Host "  External check OK: $url/login" -ForegroundColor Green
            Write-Log "External check OK: $url/login"
        }
    } catch {
        Write-Host "  External check failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Log "External check failed: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Employee URL: $url/login" -ForegroundColor Yellow
