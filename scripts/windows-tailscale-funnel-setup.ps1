# Tailscale Funnel: pharmacy (443) + optional cashflow (8443)
# Safe by default: does NOT reset unless -ForceReset (reset thrashing breaks public Funnel).
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1 -ForceReset
# NOTE: Keep this file ASCII-only. Windows PowerShell 5.1 mis-parses UTF-8 Chinese without BOM.

param(
  [switch]$ForceReset
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-sites.config.ps1")

$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-setup.log"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

function Get-FunnelStatusText {
    return ((& tailscale funnel status 2>&1 | Out-String) + (& tailscale serve status 2>&1 | Out-String))
}

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    throw "tailscale not found. Install Tailscale first."
}

$primaryPort = [int]$Global:YaoshengHostConfig.PrimaryFunnelPort
Write-Host "=== Tailscale Funnel (multi-site) ===" -ForegroundColor Cyan
Write-Log "Funnel setup start (primary=$primaryPort forceReset=$ForceReset)"

$portOk = [bool](netstat -ano | Select-String ":$primaryPort\s" | Select-String "LISTENING")
if (-not $portOk) {
    Write-Host "  Port $primaryPort not listening - start sites first (START-NOW.bat)" -ForegroundColor Red
    Write-Log "Aborted: port $primaryPort not listening"
    throw "Port $primaryPort not listening"
}

$status = Get-FunnelStatusText

# Only hard-reset when asked, or when leftover `serve` may have demoted Funnel
$hasServeOnlyConflict = ($status -match "(?i)Available within your tailnet") -and ($status -notmatch "(?i)Available on the internet|Funnel on")
if ($ForceReset -or $hasServeOnlyConflict) {
    Write-Log "Resetting funnel/serve (ForceReset=$ForceReset serveConflict=$hasServeOnlyConflict)"
    Write-Host "  Resetting funnel/serve once..." -ForegroundColor Yellow
    tailscale funnel reset 2>$null
    tailscale serve reset 2>$null
    $status = ""
}

# Ensure primary Funnel (idempotent; do not reset)
if ($status -notmatch "Funnel on" -or $status -notmatch "127\.0\.0\.1:$primaryPort") {
    $setupOut = (tailscale funnel --bg --yes $primaryPort 2>&1 | Out-String)
    Write-Log ("primary: " + $setupOut.Trim())
} else {
    Write-Log "primary already OK :$primaryPort"
    Write-Host "  Primary Funnel already OK -> 127.0.0.1:$primaryPort" -ForegroundColor Green
}

foreach ($site in $Global:YaoshengSites) {
    $port = [int]$site.Port
    $httpsPort = 0
    if ($site.ContainsKey("FunnelHttpsPort") -and $site.FunnelHttpsPort) {
        $httpsPort = [int]$site.FunnelHttpsPort
    }
    if ($httpsPort -le 0) { continue }
    if ($port -eq $primaryPort) { continue }
    if (-not (Test-Path ([string]$site.Root))) {
        Write-Host "  skip $($site.Name): root missing" -ForegroundColor Yellow
        continue
    }

    $status = Get-FunnelStatusText
    $hasHttps = $status -match [regex]::Escape(":$httpsPort")
    $hasProxy = $status -match "127\.0\.0\.1:$port"
    if ($hasHttps -and $hasProxy) {
        Write-Log "$($site.Name) already OK https=$httpsPort -> $port"
        Write-Host "  $($site.Name) Funnel already OK :$httpsPort -> 127.0.0.1:$port" -ForegroundColor Green
        continue
    }

    $listenOk = [bool](netstat -ano | Select-String ":$port\s" | Select-String "LISTENING")
    if (-not $listenOk) {
        Write-Host "  WARN: $($site.Name) port $port not listening yet - Funnel will still be configured" -ForegroundColor Yellow
    }

    $out = (tailscale funnel --bg --yes --https=$httpsPort $port 2>&1 | Out-String)
    Write-Log ("$($site.Name) https=$httpsPort -> $port : " + $out.Trim())
    Write-Host "  Funnel $($site.Name): https://<host>:$httpsPort -> 127.0.0.1:$port" -ForegroundColor Green
}

Start-Sleep -Seconds 2
$statusOut = (tailscale funnel status 2>&1 | Out-String)
Write-Host $statusOut
Write-Log $statusOut.Trim()

if ($statusOut -notmatch "Funnel on") {
    Write-Log "ERROR: Funnel not active"
    throw "Tailscale Funnel failed to start"
}

$url = $null
if ($statusOut -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }

Write-Host ""
Write-Host "Pharmacy: $url/login" -ForegroundColor Yellow
Write-Host "Cashflow: $url`:8443/" -ForegroundColor Yellow
Write-Host "NOTE: Host curl to funnel URL can be a false OK. Test on phone 4G (Wi-Fi off)." -ForegroundColor Cyan
