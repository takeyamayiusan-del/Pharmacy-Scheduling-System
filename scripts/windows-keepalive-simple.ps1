# 簡單雙站保活：本機網站斷了重開；外網 Funnel 斷了重宣告（每分鐘探測公開 URL）
# 不做 git／build／funnel reset。更新程式請用手拉。
#
# 手動測一次：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-keepalive-simple.ps1
# 外網現在不通：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-restore-funnel.ps1

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "windows-site-common.ps1")
Import-Pm2Environment -ProjectRoot $ProjectRoot
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

Write-Log "keepalive start"

$pm2 = Get-Pm2Command
if (-not $pm2) {
    Write-Log "pm2 missing (PATH=$env:Path PM2_HOME=$env:PM2_HOME) — still restoring Funnel"
}

# --- pharmacy :3000 ---
$pharmacyOk = Test-LocalOk "http://127.0.0.1:3000/login"
if (-not $pharmacyOk -and $pm2) {
    Write-Log "pharmacy down — restart on PORT=3000"
    $env:PORT = "3000"
    if (Test-Pm2AppExists -Name "pharmacy-web") {
        & $pm2 restart pharmacy-web --update-env 2>$null | Out-Null
    } else {
        $eco = Join-Path $ProjectRoot "ecosystem.config.cjs"
        if (Test-Path -LiteralPath $eco) {
            & $pm2 start $eco --only pharmacy-web --update-env 2>$null | Out-Null
        }
    }
    Start-Sleep -Seconds 4
    $pharmacyOk = Test-LocalOk "http://127.0.0.1:3000/login"
    Write-Log ("pharmacy after repair: " + $(if ($pharmacyOk) { "OK" } else { "FAIL" }))
}

# --- cashflow :5000（必須與排班分開設 PORT）---
$cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
if (-not $cashflowOk -and $pm2) {
    Write-Log "cashflow down — restart on PORT=5000"
    $env:PORT = "5000"
    if (Test-Pm2AppExists -Name "cashflow") {
        & $pm2 restart cashflow --update-env 2>$null | Out-Null
    } elseif (Test-Path -LiteralPath $CashflowScript) {
        & $pm2 delete cashflow 2>$null | Out-Null
        & $pm2 start $CashflowScript --name cashflow --cwd $CashflowCwd --update-env 2>$null | Out-Null
    }
    Start-Sleep -Seconds 3
    $cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
    Write-Log ("cashflow after repair: " + $(if ($cashflowOk) { "OK" } else { "FAIL" }))
}

# --- funnel：每分鐘探測外網；設定還在但連不上也會重宣告（不 reset）---
$funnelPublic = Repair-FunnelIfNeeded -WriteLog { param($m) Write-Log $m }

if ($pm2) {
    & $pm2 save 2>$null | Out-Null
}

Write-Log "done pharmacyOk=$pharmacyOk cashflowOk=$cashflowOk funnelPublic=$funnelPublic"

if ($pharmacyOk -and $funnelPublic) { exit 0 }
exit 1
