# 簡單雙站保活：本機網站真的掛了才重開；外網窗口不通才重宣告 Funnel。
# 不做 git／build／funnel reset。公開網址連續失敗 2 次才重宣告（避免單次誤殺）。
# 更新程式請用手拉。
#
# 手動測一次：
#   powershell -ExecutionPolicy Bypass -File scripts\windows-keepalive-simple.ps1
# 外網現在不通（立刻重宣告）：
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

function Test-PharmacyLocalOk {
    if (Test-LocalOk "http://127.0.0.1:3000/api/health") { return $true }
    return (Test-LocalOk "http://127.0.0.1:3000/login")
}

function Get-KeepaliveHealthStatePath {
    return Join-Path $ProjectRoot "data\ops\keepalive-health.json"
}

function Read-KeepaliveHealthState {
    $path = Get-KeepaliveHealthStatePath
    $obj = [ordered]@{
        pharmacyHttpFails    = 0
        cashflowHttpFails    = 0
        publicFails          = 0
        lastFunnelReapplyAt  = ""
    }
    if (Test-Path -LiteralPath $path) {
        try {
            $raw = Get-Content -LiteralPath $path -Raw -ErrorAction Stop
            $parsed = $raw | ConvertFrom-Json
            if ($null -ne $parsed.pharmacyHttpFails) { $obj.pharmacyHttpFails = [int]$parsed.pharmacyHttpFails }
            if ($null -ne $parsed.cashflowHttpFails) { $obj.cashflowHttpFails = [int]$parsed.cashflowHttpFails }
            if ($null -ne $parsed.publicFails) { $obj.publicFails = [int]$parsed.publicFails }
            if ($parsed.lastFunnelReapplyAt) { $obj.lastFunnelReapplyAt = [string]$parsed.lastFunnelReapplyAt }
        } catch {}
    }
    return $obj
}

function Save-KeepaliveHealthState($state) {
    $path = Get-KeepaliveHealthStatePath
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    ($state | ConvertTo-Json) | Set-Content -LiteralPath $path -Encoding UTF8
}

Write-Log "keepalive start"
$healthState = Read-KeepaliveHealthState

$pm2 = Get-Pm2Command
if (-not $pm2) {
    Write-Log "pm2 missing (PATH=$env:Path PM2_HOME=$env:PM2_HOME) — still restoring Funnel"
}

# --- pharmacy :3000 ---
# 埠還在聽就不要因單次 /login 逾時重啟（匯出 PDF、尖峰載入會讓 8 秒探測失敗，重啟會把正在用的人踢掉）
$pharmacyOk = Test-PharmacyLocalOk
$pharmacyListen = Test-PortListening 3000
if ($pharmacyOk) {
    $healthState.pharmacyHttpFails = 0
} elseif ($pharmacyListen) {
    $healthState.pharmacyHttpFails = [int]$healthState.pharmacyHttpFails + 1
    Write-Log "pharmacy HTTP miss but :3000 listening (fails=$($healthState.pharmacyHttpFails)/3) — skip restart"
    $pharmacyOk = $true
    if ($pm2 -and [int]$healthState.pharmacyHttpFails -ge 3) {
        Write-Log "pharmacy HTTP miss x3 — restart on PORT=3000"
        $env:PORT = "3000"
        if (Test-Pm2AppExists -Name "pharmacy-web") {
            & $pm2 restart pharmacy-web --update-env 2>$null | Out-Null
        }
        Start-Sleep -Seconds 4
        $pharmacyOk = Test-PharmacyLocalOk
        $healthState.pharmacyHttpFails = 0
        Write-Log ("pharmacy after repair: " + $(if ($pharmacyOk) { "OK" } else { "FAIL" }))
    }
} elseif ($pm2) {
    Write-Log "pharmacy down (port closed) — restart on PORT=3000"
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
    $pharmacyOk = Test-PharmacyLocalOk
    $healthState.pharmacyHttpFails = 0
    Write-Log ("pharmacy after repair: " + $(if ($pharmacyOk) { "OK" } else { "FAIL" }))
}

# --- cashflow :5000（必須與排班分開設 PORT）---
$cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
$cashflowListen = Test-PortListening 5000
if ($cashflowOk) {
    $healthState.cashflowHttpFails = 0
} elseif ($cashflowListen) {
    $healthState.cashflowHttpFails = [int]$healthState.cashflowHttpFails + 1
    Write-Log "cashflow HTTP miss but :5000 listening (fails=$($healthState.cashflowHttpFails)/3) — skip restart"
    $cashflowOk = $true
    if ($pm2 -and [int]$healthState.cashflowHttpFails -ge 3) {
        Write-Log "cashflow HTTP miss x3 — restart on PORT=5000"
        $env:PORT = "5000"
        if (Test-Pm2AppExists -Name "cashflow") {
            & $pm2 restart cashflow --update-env 2>$null | Out-Null
        }
        Start-Sleep -Seconds 3
        $cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
        $healthState.cashflowHttpFails = 0
        Write-Log ("cashflow after repair: " + $(if ($cashflowOk) { "OK" } else { "FAIL" }))
    }
} elseif ($pm2) {
    Write-Log "cashflow down (port closed) — restart on PORT=5000"
    $env:PORT = "5000"
    if (Test-Pm2AppExists -Name "cashflow") {
        & $pm2 restart cashflow --update-env 2>$null | Out-Null
    } elseif (Test-Path -LiteralPath $CashflowScript) {
        & $pm2 delete cashflow 2>$null | Out-Null
        & $pm2 start $CashflowScript --name cashflow --cwd $CashflowCwd --update-env 2>$null | Out-Null
    }
    Start-Sleep -Seconds 3
    $cashflowOk = Test-LocalOk "http://127.0.0.1:5000/"
    $healthState.cashflowHttpFails = 0
    Write-Log ("cashflow after repair: " + $(if ($cashflowOk) { "OK" } else { "FAIL" }))
}

# --- funnel：一定檢查外網窗口。內網通但外網不通，連續 2 次才重宣告（不 reset）---
$funnelPublic = Repair-FunnelIfNeeded `
    -WriteLog { param($m) Write-Log $m } `
    -LocalOk $pharmacyOk `
    -MinPublicFails 2 `
    -HealthState $healthState

if ($pm2) {
    & $pm2 save 2>$null | Out-Null
}

Save-KeepaliveHealthState $healthState
Write-Log "done pharmacyOk=$pharmacyOk cashflowOk=$cashflowOk funnelPublic=$funnelPublic"

if ($pharmacyOk -and $funnelPublic) { exit 0 }
exit 1
