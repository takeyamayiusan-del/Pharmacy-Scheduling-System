# Tailscale Funnel：同時對外開「排班 :3000」與「金流 :8443」（若本機有在聽）
# 注意：不可只重建 3000，否則 funnel reset 後金流外網會整段消失。
# 系統管理員執行：
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

# 確保排班本機已起來
$portOk = Test-PortListening 3000
if (-not $portOk) {
    Write-Host "  Port 3000 not listening — start site first (pm2 restart pharmacy-web 或 scripts\windows-docker-boot.ps1)" -ForegroundColor Red
    Write-Log "Aborted: port 3000 not listening"
    throw "Port 3000 not listening"
}

$wantCashflowFunnel = Test-PortListening 8443
if ($wantCashflowFunnel) {
    Write-Host "  Detected cashflow on :8443 — will restore Funnel for both ports" -ForegroundColor Yellow
    Write-Log "Cashflow :8443 listening; dual Funnel"
} else {
    Write-Log "Cashflow :8443 not listening; Funnel pharmacy only"
}

# reset 後一定要把兩個埠都加回來
tailscale funnel reset 2>$null
tailscale serve reset 2>$null

$setupOut = (tailscale funnel --bg --yes 3000 2>&1 | Out-String)
Write-Log ("pharmacy funnel: " + $setupOut.Trim())

if ($wantCashflowFunnel) {
    $cfOut = (tailscale funnel --bg --yes 8443 2>&1 | Out-String)
    Write-Log ("cashflow funnel: " + $cfOut.Trim())
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
    Write-Log "ERROR: Funnel missing 127.0.0.1:3000"
    throw "Tailscale Funnel missing pharmacy :3000"
}

if ($wantCashflowFunnel -and $statusOut -notmatch "127\.0\.0\.1:8443") {
    Write-Host "  Warning: Funnel missing cashflow :8443 — retry once" -ForegroundColor Yellow
    Write-Log "WARNING: Funnel missing 8443, retry"
    $cfRetry = (tailscale funnel --bg --yes 8443 2>&1 | Out-String)
    Write-Log $cfRetry.Trim()
    Start-Sleep -Seconds 2
    $statusOut = (tailscale funnel status 2>&1 | Out-String)
    Write-Log $statusOut.Trim()
}

$url = $null
if ($statusOut -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }
if ($url) {
    try {
        $r = Invoke-WebRequest -Uri "$url/login" -UseBasicParsing -TimeoutSec 25
        if ($r.StatusCode -eq 200) {
            Write-Host "  Pharmacy Funnel OK: $url/login" -ForegroundColor Green
            Write-Log "External check OK: $url/login"
        }
    } catch {
        Write-Host "  Pharmacy Funnel check failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Log "External check failed: $($_.Exception.Message)"
    }

    if ($wantCashflowFunnel) {
        $cfUrl = "${url}:8443/"
        try {
            $r2 = Invoke-WebRequest -Uri $cfUrl -UseBasicParsing -TimeoutSec 25
            Write-Host "  Cashflow Funnel OK: $cfUrl (HTTP $($r2.StatusCode))" -ForegroundColor Green
            Write-Log "Cashflow Funnel OK: $cfUrl"
        } catch {
            Write-Host "  Cashflow Funnel check failed: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Log "Cashflow Funnel check failed: $($_.Exception.Message)"
        }
    }
}

Write-Host ""
Write-Host "排班（員工）: $url/login" -ForegroundColor Yellow
if ($wantCashflowFunnel -and $url) {
    Write-Host "金流:         ${url}:8443/" -ForegroundColor Yellow
}
Write-Host "本機確認:     pm2 status   /   tailscale funnel status" -ForegroundColor Gray
