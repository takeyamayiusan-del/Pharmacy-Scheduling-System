# 簡單雙站保活：只檢查／重啟 PM2 + 補 Funnel，不做 git／build／funnel reset
# 更新程式請用手拉；不要用 windows-update-site.ps1
#
# 手動測一次：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-keepalive-simple.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDir "keepalive-simple.log"
$CashflowScript = "C:\cash-flow-app\backend\index.js"
$CashflowCwd = "C:\cash-flow-app"

function Write-Log([string]$Message) {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    Add-Content -Path $LogFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -Encoding UTF8
}

function Test-LocalOk([string]$Uri) {
    try {
        $code = & curl.exe -s -o NUL -w "%{http_code}" --connect-timeout 3 --max-time 8 $Uri
        return ($code -eq "200" -or $code -eq "304")
    } catch {
        return $false
    }
}

function Get-FunnelJsonText {
    return (tailscale funnel status --json 2>$null | Out-String)
}

function Test-FunnelHasRoute([int]$HttpsPort, [int]$LocalPort) {
    $json = Get-FunnelJsonText
    if (-not $json) { return $false }
    $hasPublic = $json -match (":" + [regex]::Escape([string]$HttpsPort))
    $hasLocal = $json.Contains("127.0.0.1:$LocalPort")
    return ($hasPublic -and $hasLocal)
}

function Ensure-FunnelRoute {
    param(
        [int]$HttpsPort,
        [int]$LocalPort
    )
    if (Test-FunnelHasRoute -HttpsPort $HttpsPort -LocalPort $LocalPort) {
        return $true
    }
    # 只補缺，绝不 funnel reset / serve reset
    if ($HttpsPort -eq 443) {
        $out = (tailscale funnel --bg --yes --https=443 $LocalPort 2>&1 | Out-String)
    } else {
        $out = (tailscale funnel --bg --yes --https=$HttpsPort "http://127.0.0.1:$LocalPort" 2>&1 | Out-String)
    }
    Write-Log ("funnel ensure https=$HttpsPort -> $LocalPort : " + $out.Trim())
    Start-Sleep -Seconds 1
    return (Test-FunnelHasRoute -HttpsPort $HttpsPort -LocalPort $LocalPort)
}

Write-Log "keepalive start"

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Log "pm2 missing"
    exit 1
}

# --- pharmacy :3000 ---
$pharmacyOk = Test-LocalOk "http://127.0.0.1:3000/login"
if (-not $pharmacyOk) {
    Write-Log "pharmacy down — restart on PORT=3000"
    $env:PORT = "3000"
    $desc = & pm2 jlist 2>$null
    $hasPharmacy = $desc -and ($desc | Out-String) -match '"name"\s*:\s*"pharmacy-web"'
    if ($hasPharmacy) {
        & pm2 restart pharmacy-web --update-env 2>$null | Out-Null
    } else {
        $eco = Join-Path $ProjectRoot "ecosystem.config.cjs"
        if (Test-Path -LiteralPath $eco) {
            & pm2 start $eco --only pharmacy-web --update-env 2>$null | Out-Null
        }
    }
    Start-Sleep -Seconds 4
    $pharmacyOk = Test-LocalOk "http://127.0.0.1:3000/login"
    Write-Log ("pharmacy after repair: " + $(if ($pharmacyOk) { "OK" } else { "FAIL" }))
}

# --- cashflow :5000（必須與排班分開設 PORT）---
$cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
if (-not $cashflowOk) {
    Write-Log "cashflow down — restart on PORT=5000"
    $env:PORT = "5000"
    $desc = & pm2 jlist 2>$null
    $hasCashflow = $desc -and ($desc | Out-String) -match '"name"\s*:\s*"cashflow"'
    if ($hasCashflow) {
        & pm2 restart cashflow --update-env 2>$null | Out-Null
    } elseif (Test-Path -LiteralPath $CashflowScript) {
        & pm2 delete cashflow 2>$null | Out-Null
        & pm2 start $CashflowScript --name cashflow --cwd $CashflowCwd --update-env 2>$null | Out-Null
    }
    Start-Sleep -Seconds 3
    $cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
    Write-Log ("cashflow after repair: " + $(if ($cashflowOk) { "OK" } else { "FAIL" }))
}

# --- funnel：只補缺 ---
$funnelPharmacy = $false
$funnelCashflow = $false
if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    if ($pharmacyOk) { $funnelPharmacy = Ensure-FunnelRoute -HttpsPort 443 -LocalPort 3000 }
    if ($cashflowOk) { $funnelCashflow = Ensure-FunnelRoute -HttpsPort 8443 -LocalPort 5000 }
} else {
    Write-Log "tailscale missing — skip funnel"
}

& pm2 save 2>$null | Out-Null

Write-Log "done pharmacyOk=$pharmacyOk cashflowOk=$cashflowOk funnel443=$funnelPharmacy funnel8443=$funnelCashflow"

if ($pharmacyOk -and $cashflowOk) { exit 0 }
exit 1
