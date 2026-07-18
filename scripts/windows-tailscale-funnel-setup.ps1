# Tailscale Funnel: pharmacy (443) + optional cashflow (8443)
# Run as Administrator if prompted:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-sites.config.ps1")

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
Write-Host "=== Tailscale Funnel (multi-site) ===" -ForegroundColor Cyan
Write-Log "Funnel setup start (primary=$primaryPort)"

$portOk = [bool](netstat -ano | Select-String ":$primaryPort\s" | Select-String "LISTENING")
if (-not $portOk) {
    Write-Host "  Port $primaryPort not listening — start sites first (START-NOW.bat)" -ForegroundColor Red
    Write-Log "Aborted: port $primaryPort not listening"
    throw "Port $primaryPort not listening"
}

# Reset both so we do not leave a leftover `serve` mount that demotes Funnel
tailscale funnel reset 2>$null
tailscale serve reset 2>$null

$setupOut = (tailscale funnel --bg --yes $primaryPort 2>&1 | Out-String)
Write-Log ("primary: " + $setupOut.Trim())

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

    $listenOk = [bool](netstat -ano | Select-String ":$port\s" | Select-String "LISTENING")
    if (-not $listenOk) {
        Write-Host "  WARN: $($site.Name) port $port not listening yet — Funnel will still be configured" -ForegroundColor Yellow
    }

    $out = (tailscale funnel --bg --yes --https=$httpsPort $port 2>&1 | Out-String)
    Write-Log ("$($site.Name) https=$httpsPort -> $port : " + $out.Trim())
    Write-Host "  Funnel $($site.Name): https://<host>:$httpsPort -> 127.0.0.1:$port" -ForegroundColor Green
}

Start-Sleep -Seconds 3
$statusOut = (tailscale funnel status 2>&1 | Out-String)
Write-Host $statusOut
Write-Log $statusOut.Trim()

if ($statusOut -notmatch "Funnel on") {
    Write-Log "ERROR: Funnel not active"
    throw "Tailscale Funnel failed to start"
}

$url = $null
if ($statusOut -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }
if ($url) {
    try {
        $r = Invoke-WebRequest -Uri "$url/login" -UseBasicParsing -TimeoutSec 25
        if ($r.StatusCode -eq 200) {
            Write-Host "  Pharmacy OK: $url/login" -ForegroundColor Green
            Write-Log "Pharmacy OK: $url/login"
        }
    } catch {
        Write-Host "  Pharmacy external check failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Log "Pharmacy external check failed: $($_.Exception.Message)"
    }

    foreach ($site in $Global:YaoshengSites) {
        $httpsPort = 0
        if ($site.ContainsKey("FunnelHttpsPort") -and $site.FunnelHttpsPort) {
            $httpsPort = [int]$site.FunnelHttpsPort
        }
        if ($httpsPort -le 0) { continue }
        $cashUrl = "$url`:$httpsPort/"
        try {
            $r2 = Invoke-WebRequest -Uri $cashUrl -UseBasicParsing -TimeoutSec 25
            Write-Host "  $($site.Name) OK: $cashUrl (HTTP $($r2.StatusCode))" -ForegroundColor Green
            Write-Log "$($site.Name) OK: $cashUrl"
        } catch {
            Write-Host "  $($site.Name) external check failed: $($_.Exception.Message)" -ForegroundColor Red
            Write-Log "$($site.Name) external check failed: $($_.Exception.Message)"
        }
    }
}

Write-Host ""
Write-Host "排班（員工）: $url/login" -ForegroundColor Yellow
Write-Host "金流:         $url`:8443/" -ForegroundColor Yellow
