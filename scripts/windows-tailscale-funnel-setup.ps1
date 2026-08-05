# Tailscale Funnel: 排班 443→3000、現金帳 8443→5000（本機 HTTP）
# Run as Administrator:
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1
# 僅排班單入口：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-tailscale-funnel-setup.ps1 -PharmacyOnly
#
# 注意：純文字 `tailscale funnel status` 常只顯示 443；請用
#   `tailscale funnel status --json` 或瀏覽器驗證 :8443。

param(
    [switch]$PharmacyOnly
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "funnel-setup.log"
$CashflowLocalPort = 5000
$CashflowPublicPort = 8443

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

# 先設排班，再設現金帳；不要中途 reset（會清掉剛設好的規則）
tailscale funnel reset 2>$null
tailscale serve reset 2>$null

$setupOut = (tailscale funnel --bg --yes 3000 2>&1 | Out-String)
Write-Log ("pharmacy funnel: " + $setupOut.Trim())

if (-not $PharmacyOnly) {
    Start-Sleep -Seconds 1
    $cashflowOut = (tailscale funnel --bg --yes --https=$CashflowPublicPort $CashflowLocalPort 2>&1 | Out-String)
    Write-Log ("cashflow funnel: " + $cashflowOut.Trim())
}

Start-Sleep -Seconds 3
$statusOut = (tailscale funnel status 2>&1 | Out-String)
$statusJson = (tailscale funnel status --json 2>&1 | Out-String)
Write-Host $statusOut
Write-Log $statusOut.Trim()
Write-Log ("funnel status json: " + $statusJson.Trim())

if ($statusOut -notmatch "Funnel on" -and $statusJson -notmatch '"AllowFunnel"') {
    Write-Log "ERROR: Funnel not active"
    throw "Tailscale Funnel failed to start"
}

$pharmacyOk = Test-FunnelProxyConfigured -LocalPort 3000 -PublicHttpsPort 443
if (-not $pharmacyOk) {
    # 部分 CLI 把預設 443 省略，改用不限公開埠檢查
    $pharmacyOk = Test-FunnelProxyConfigured -LocalPort 3000
}
$cashflowOk = $PharmacyOnly -or (Test-FunnelProxyConfigured -LocalPort $CashflowLocalPort -PublicHttpsPort $CashflowPublicPort)
if (-not $PharmacyOnly -and -not $cashflowOk) {
    $cashflowOk = Test-FunnelProxyConfigured -LocalPort $CashflowLocalPort
}

if (-not $pharmacyOk) {
    Write-Host "  Warning: pharmacy funnel (→3000) may not be configured" -ForegroundColor Yellow
    Write-Log "Warning: missing proxy to 127.0.0.1:3000"
}
if (-not $PharmacyOnly -and -not $cashflowOk) {
    Write-Host "  Warning: cashflow funnel (8443→$CashflowLocalPort) may not be configured" -ForegroundColor Yellow
    Write-Host "  Tip: plain 'funnel status' often hides :8443 — check JSON or browser." -ForegroundColor DarkGray
    Write-Log "Warning: missing proxy to 127.0.0.1:$CashflowLocalPort"
}

$url = $null
if ($statusOut -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }
if (-not $url -and $statusJson -match '(https://[a-z0-9-]+\.tail[a-z0-9]+\.ts\.net)') { $url = $Matches[1] }
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
    Write-Host "  Verify with: tailscale funnel status --json" -ForegroundColor DarkGray
    Write-Host "  (Use a browser for :8443; curl on Windows may show TLS errors.)" -ForegroundColor DarkGray
    if ($cashflowOk) {
        Write-Host "  Cashflow funnel JSON check: OK" -ForegroundColor Green
    }
}
